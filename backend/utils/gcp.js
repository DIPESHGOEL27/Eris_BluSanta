const {
  InstancesClient,
  ZoneOperationsClient,
} = require("@google-cloud/compute");
const { Storage } = require("@google-cloud/storage");

const operationsClient = new ZoneOperationsClient({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE,
});

const projectId = process.env.GCP_PROJECT_ID;

const computeClient = new InstancesClient({
  projectId: projectId,
  keyFilename: process.env.GCP_KEY_FILE,
});

const storageClient = new Storage({
  projectId: projectId,
  keyFilename: process.env.GCP_KEY_FILE,
});

/**
 * Get the current state of a VM
 */
async function getVMState(zone, instanceName) {
  try {
    const [instance] = await computeClient.get({
      project: projectId,
      zone,
      instance: instanceName,
    });
    const state = instance.status;
    console.log(`getVMState:: [${instanceName}] State: ${state}`);
    return state;
  } catch (error) {
    console.error(
      `getVMState::[${instanceName}] Error fetching VM state:`,
      error
    );
    return null;
  }
}

/**
 * Wait for VM to reach a valid state
 */
async function waitForValidState(
  zone,
  instanceName,
  validStates = ["RUNNING", "TERMINATED"]
) {
  while (true) {
    const state = await getVMState(zone, instanceName);
    if (!state) return null;

    if (validStates.includes(state)) {
      return state;
    }
    console.log(`[${instanceName}] Current state: ${state}. Waiting 1s...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Start a VM
 */
async function startVM(zone, instanceName) {
  try {
    const [operation] = await computeClient.start({
      project: projectId,
      zone,
      instance: instanceName,
    });

    console.log(`[${instanceName}] Start operation started...`);

    let operationStatus = operation;
    while (operationStatus.status !== "DONE") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      [operationStatus] = await operationsClient.get({
        project: projectId,
        zone,
        operation: operation.name,
      });
    }

    if (operationStatus.error) {
      console.error(
        `[${instanceName}] Error starting VM:`,
        operationStatus.error
      );
      throw new Error(JSON.stringify(operationStatus.error));
    }

    console.log(`[${instanceName}] VM started successfully.`);
  } catch (error) {
    console.error(`[${instanceName}] Error starting VM:`, error);
    throw error;
  }
}

/**
 * Stop a VM
 */
async function stopVM(zone, instanceName) {
  try {
    const [operation] = await computeClient.stop({
      project: projectId,
      zone,
      instance: instanceName,
    });

    console.log(`[${instanceName}] Stop operation started...`);

    let operationStatus = operation;
    while (operationStatus.status !== "DONE") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      [operationStatus] = await operationsClient.get({
        project: projectId,
        zone,
        operation: operation.name,
      });
    }

    if (operationStatus.error) {
      console.error(
        `[${instanceName}] Error stopping VM:`,
        operationStatus.error
      );
      throw new Error(JSON.stringify(operationStatus.error));
    }

    console.log(`[${instanceName}] VM stopped successfully.`);
  } catch (error) {
    console.error(`[${instanceName}] Error stopping VM:`, error);
    throw error;
  }
}

/**
 * Get the external IP of a VM
 */
async function getExternalIP(zone, instanceName) {
  try {
    const [instance] = await computeClient.get({
      project: projectId,
      zone,
      instance: instanceName,
    });

    const networkInterfaces = instance.networkInterfaces || [];
    for (const iface of networkInterfaces) {
      const accessConfigs = iface.accessConfigs || [];
      for (const config of accessConfigs) {
        if (config.natIP) {
          console.log(`[${instanceName}] External IP: ${config.natIP}`);
          return config.natIP;
        }
      }
    }

    console.log(`[${instanceName}] No external IP found.`);
    return null;
  } catch (error) {
    console.error(`[${instanceName}] Error getting external IP:`, error);
    return null;
  }
}

/**
 * Ensure a VM is running (start if not)
 */
async function ensureVMRunning(zone, instanceName) {
  const state = await waitForValidState(zone, instanceName);
  if (state === "TERMINATED") {
    await startVM(zone, instanceName);
    await waitForValidState(zone, instanceName, ["RUNNING"]);
  }
}

/**
 * Ensure multiple VMs are running
 */
async function ensureVMsRunning(servers) {
  const promises = servers.map((server) =>
    ensureVMRunning(server.zone, server.name)
  );
  await Promise.all(promises);
}

/**
 * Stop multiple VMs
 */
async function stopVMs(servers) {
  const promises = servers.map((server) => stopVM(server.zone, server.name));
  await Promise.all(promises);
}

/**
 * Convert HTTP URL to GCS URL
 */
function convertHttpUrlToGsUrl(httpUrl) {
  if (!httpUrl) return httpUrl;
  if (httpUrl.startsWith("gs://")) return httpUrl;

  const match = httpUrl.match(
    /https?:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)/
  );
  if (match) {
    return `gs://${match[1]}/${match[2]}`;
  }
  return httpUrl;
}

/**
 * Check if a GCS file exists
 */
async function isGCSFileExists(url) {
  try {
    const gsUrl = convertHttpUrlToGsUrl(url);
    const match = gsUrl.match(/gs:\/\/([^/]+)\/(.+)/);
    if (!match) {
      console.error(`Invalid GCS URL: ${url}`);
      return false;
    }

    const [, bucketName, filePath] = match;
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(decodeURIComponent(filePath));

    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error(`Error checking GCS file existence:`, error);
    return false;
  }
}

/**
 * Validate a single GCS object exists and is not empty
 */
async function validateGcsObject(url) {
  try {
    const gsUrl = convertHttpUrlToGsUrl(url);
    const match = gsUrl.match(/gs:\/\/([^/]+)\/(.+)/);
    if (!match) {
      return { valid: false, error: "Invalid GCS URL format", url };
    }

    const [, bucketName, filePath] = match;
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(decodeURIComponent(filePath));

    const [exists] = await file.exists();
    if (!exists) {
      return { valid: false, error: "File does not exist", url };
    }

    const [metadata] = await file.getMetadata();
    if (!metadata.size || metadata.size === 0) {
      return { valid: false, error: "File is empty (0 bytes)", url };
    }

    return { valid: true, url, size: metadata.size };
  } catch (error) {
    return { valid: false, error: error.message, url };
  }
}

/**
 * Validate multiple GCS objects
 */
async function validateGcsObjects(urls) {
  const results = await Promise.all(
    urls.map(async (url, index) => {
      const result = await validateGcsObject(url);
      return { ...result, index };
    })
  );

  const allValid = results.every((r) => r.valid);
  return { allValid, results };
}

/**
 * Upload a buffer to GCS
 */
async function uploadBufferToGCS(buffer, bucketName, filePath, contentType) {
  try {
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: contentType,
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
    console.log(`[GCS] ✅ Uploaded to: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error(`[GCS] ❌ Error uploading to GCS:`, error);
    throw error;
  }
}

/**
 * Get signed URL for file upload
 */
async function getSignedUploadUrl(
  bucketName,
  filePath,
  contentType,
  expiresIn = 15 * 60 * 1000
) {
  try {
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filePath);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresIn,
      contentType: contentType,
    });

    return signedUrl;
  } catch (error) {
    console.error(`[GCS] ❌ Error generating signed URL:`, error);
    throw error;
  }
}

module.exports = {
  getVMState,
  waitForValidState,
  startVM,
  stopVM,
  getExternalIP,
  ensureVMRunning,
  ensureVMsRunning,
  stopVMs,
  convertHttpUrlToGsUrl,
  isGCSFileExists,
  validateGcsObject,
  validateGcsObjects,
  uploadBufferToGCS,
  getSignedUploadUrl,
  storageClient,
};
