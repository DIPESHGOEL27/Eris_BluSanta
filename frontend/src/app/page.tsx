"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
// import Image from "next/image";

type VideoState = {
  video1: File | null;
  video2: File | null;
};

type Employee = {
  "Emp Code": string;
  Name: string;
  Mobile: string;
};

export default function AssessmentForm() {
  const [uploadedVideoUrls, setUploadedVideoUrls] = useState<
    Record<string, string>
  >({});
  const [isUploading, setIsUploading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    employeeCode: "",
    employeeName: "",
    employeeMobile: "",
    drCode: "",
    drFirstName: "",
    drLastName: "",
    drMobile: "",
    videoLanguage: "English",
    namePronunciation: "", // Doctor's name as it should appear in the video
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  const [videos, setVideos] = useState<VideoState>({
    video1: null,
    video2: null,
  });

  const [uploadStatus, setUploadStatus] = useState({
    video1: "",
    video2: "",
  });

  const [errors, setErrors] = useState({
    employeeCode: "",
    drCode: "",
    drFirstName: "",
    drLastName: "",
    drMobile: "",
    namePronunciation: "",
    video1: "",
    video2: "",
  });

  // Load employee data from CSV
  useEffect(() => {
    setLoading(true);
    fetch("/mr-list.csv")
      .then((response) => response.text())
      .then((csvData) => {
        const results = Papa.parse<Employee>(csvData, {
          header: true,
          skipEmptyLines: true,
        });

        if (results.data) {
          setEmployees(results.data);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error loading employee data:", error);
        setLoading(false);
      });
  }, []);

  // Fetch employee details when employee code changes
  useEffect(() => {
    if (formData.employeeCode && formData.employeeCode.length >= 4) {
      // Only search if employees data is loaded
      if (employees.length === 0) {
        return; // Don't validate until data is loaded
      }

      // Find employee with matching code
      const employee = employees.find(
        (emp) => emp["Emp Code"] === formData.employeeCode.toUpperCase()
      );

      if (employee) {
        setFormData((prev) => ({
          ...prev,
          employeeName: employee.Name || "",
          employeeMobile: employee.Mobile || "",
        }));

        // Clear error if employee found
        setErrors((prev) => ({
          ...prev,
          employeeCode: "",
        }));
      } else {
        // Only show error if employees are loaded but code not found
        setErrors((prev) => ({
          ...prev,
          employeeCode: "Employee not found in MR list",
        }));

        // Clear fields
        setFormData((prev) => ({
          ...prev,
          employeeName: "",
          employeeMobile: "",
        }));
      }
    } else if (formData.employeeCode.length < 4) {
      // Clear error if user is still typing
      setErrors((prev) => ({
        ...prev,
        employeeCode: "",
      }));
    }
  }, [formData.employeeCode, employees]);

  const getSignedUrl = async (fileName: string, fileType: string) => {
    try {
      // Use relative URL to leverage Next.js rewrites in next.config.ts
      const response = await fetch("/api/get-signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileName, fileType }),
      });

      if (!response.ok) {
        throw new Error("Failed to get signed URL");
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error("Error getting signed URL:", error);
      return null;
    }
  };

  // Function to upload a file using the signed URL
  const uploadFileWithSignedUrl = async (file: File, signedUrl: string) => {
    try {
      const response = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      // Return the public URL (this depends on your backend implementation)
      // Often the signed URL without query params becomes the public URL
      return signedUrl.split("?")[0];
    } catch (error) {
      console.error("Error uploading file:", error);
      return null;
    }
  };

  const validateField = (name: string, value: string) => {
    let errorMessage = "";

    switch (name) {
      case "employeeCode":
        if (!value) {
          errorMessage = "Employee Code is required";
        } else {
          // Check if employee code exists in the MR list
          const employee = employees.find(
            (emp) => emp["Emp Code"] === value.toUpperCase()
          );
          if (!employee) {
            errorMessage = "Employee Code not found in MR list";
          }
        }
        break;
      case "drCode":
        if (!value) {
          errorMessage = "Doctor Code is required";
        } else if (!/^\d{8}$/.test(value)) {
          errorMessage = "Doctor Code must be exactly 8 numeric digits";
        }
        break;
      case "drFirstName":
        if (!value) {
          errorMessage = "Doctor First Name is required";
        } else if (/^Dr\.\s/.test(value)) {
          errorMessage = 'Enter name without "Dr." prefix';
        }
        break;
      case "drLastName":
        if (!value) {
          errorMessage = "Doctor Last Name is required";
        }
        break;
      case "drMobile":
        if (!value) {
          errorMessage = "Doctor Mobile number is required";
        } else if (!/^\d{10}$/.test(value)) {
          errorMessage = "Please enter a 10-digit phone number";
        }
        break;
      case "namePronunciation":
        if (!value) {
          errorMessage = "Name pronunciation is required for audio generation";
        } else if (value.length < 2) {
          errorMessage = "Please enter a valid pronunciation";
        }
        break;
      default:
        break;
    }

    return errorMessage;
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const sanitizedValue =
      name === "employeeCode" || name === "drCode" ? value.trim() : value;
    setFormData((prev) => ({
      ...prev,
      [name]: sanitizedValue,
    }));

    // Validate the field
    if (name in errors) {
      const errorMessage = validateField(name, sanitizedValue);
      setErrors((prev) => ({
        ...prev,
        [name]: errorMessage,
      }));
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    videoKey: keyof VideoState
  ) => {
    const file = e.target.files?.[0] || null;
    setVideos((prev) => ({
      ...prev,
      [videoKey]: file,
    }));

    // Clear error if file is selected
    if (file) {
      setErrors((prev) => ({
        ...prev,
        [videoKey]: "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {
      employeeCode: validateField("employeeCode", formData.employeeCode),
      drCode: validateField("drCode", formData.drCode),
      drFirstName: validateField("drFirstName", formData.drFirstName),
      drLastName: validateField("drLastName", formData.drLastName),
      drMobile: validateField("drMobile", formData.drMobile),
      namePronunciation: "", // Commented out - using drFirstName instead
      video1: !videos.video1 ? "Response Video 1 is required" : "",
      video2: !videos.video2 ? "Response Video 2 is required" : "",
    };

    setErrors(newErrors);

    // Check if there are any errors
    return !Object.values(newErrors).some((error) => error !== "");
  };

  const handleUpload = async () => {
    // Validate all fields before submitting
    const isValid = validateForm();
    if (!isValid) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsUploading(true);

    // Create an object to store upload results
    const uploadResults: Record<string, string> = {};

    // Upload each video file using signed URLs
    for (const [key, file] of Object.entries(videos)) {
      if (file) {
        // Update status
        setUploadStatus((prev) => ({
          ...prev,
          [key]: "Requesting signed URL...",
        }));

        // Generate a unique filename using drMobile as folder structure
        const fileObj = file as File;
        const fileExt = fileObj.name.split(".").pop() || "mp4";
        const fileName = `${formData.drMobile}/${key}.${fileExt}`;

        // Get signed URL
        const signedUrl = await getSignedUrl(fileName, fileObj.type);

        if (signedUrl) {
          setUploadStatus((prev) => ({ ...prev, [key]: "Uploading..." }));

          // Upload the file
          const uploadedUrl = await uploadFileWithSignedUrl(fileObj, signedUrl);

          if (uploadedUrl) {
            uploadResults[key] = uploadedUrl;
            setUploadStatus((prev) => ({
              ...prev,
              [key]: "Uploaded successfully",
            }));
          } else {
            setUploadStatus((prev) => ({ ...prev, [key]: "Upload failed" }));
          }
        } else {
          setUploadStatus((prev) => ({
            ...prev,
            [key]: "Failed to get signed URL",
          }));
        }
      }
    }
    setUploadedVideoUrls(uploadResults);
    setIsUploading(false);
    // Check for 2 videos (video1, video2)
    setIsUploaded(Object.keys(uploadResults).length === 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    setIsSubmitting(true);

    // Prepare final data with form data and video URLs to match the backend schema
    // Using drFirstName as namePronunciation for audio generation
    const finalData = {
      employeeCode: formData.employeeCode.trim(),
      employeeName: formData.employeeName,
      employeeMobile: formData.employeeMobile,
      drCode: formData.drCode.trim(),
      drFirstName: formData.drFirstName,
      drLastName: formData.drLastName,
      drMobile: formData.drMobile,
      videoLanguage: formData.videoLanguage,
      namePronunciation: formData.drFirstName, // Use drFirstName as the name for audio generation
      videos: uploadedVideoUrls,
    };

    // Submit the form data with video URLs to your backend
    try {
      // Use relative URL to leverage Next.js rewrites in next.config.ts
      const response = await fetch("/api/submit-assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(finalData),
      });

      if (response.ok) {
        alert("Videos submitted successfully!");
        // Reset form
        setFormData({
          employeeCode: "",
          employeeName: "",
          employeeMobile: "",
          drCode: "",
          drFirstName: "",
          drLastName: "",
          drMobile: "",
          videoLanguage: "English",
          namePronunciation: "",
        });

        // Reset video files
        setVideos({
          video1: null,
          video2: null,
        });

        // Reset upload status
        setUploadStatus({
          video1: "",
          video2: "",
        });

        setUploadedVideoUrls({});
        setIsUploaded(false);

        // Reset file input fields by clearing their values
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach((input) => {
          if (input instanceof HTMLInputElement) {
            input.value = "";
          }
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(
          `Failed to submit assessment: ${errorData.message || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error("Error submitting assessment:", error);
      alert("Error submitting assessment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 text-black">
      <div className="mb-8 text-center">
        <div className="inline-block">
          <h1 className="text-3xl font-bold text-blue-600">
            Eris BluSanta Campaign
          </h1>
          <p className="text-gray-600 mt-2">
            Doctor Video Response Assessment Form
          </p>
        </div>
      </div>

      {/* Display overall form error messages if any */}
      {Object.values(errors).some((error) => error !== "") && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-medium">Please correct the following errors:</p>
          <ul className="list-disc ml-5 mt-1">
            {Object.entries(errors).map(([key, value]) =>
              value ? <li key={key}>{value}</li> : null
            )}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column - Form Fields */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            {/* Language is fixed to English - hidden field */}
            <input type="hidden" name="videoLanguage" value="English" />

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Employee Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="employeeCode"
                placeholder="Enter Employee Code"
                value={formData.employeeCode}
                onChange={handleInputChange}
                className={`w-full p-2 border rounded bg-white text-black ${
                  errors.employeeCode
                    ? "border-red-500"
                    : formData.employeeName
                    ? "border-green-500"
                    : "border-gray-300"
                }`}
              />
              {errors.employeeCode && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.employeeCode}
                </p>
              )}
              {!errors.employeeCode &&
                formData.employeeName &&
                formData.employeeCode && (
                  <p className="text-green-600 text-xs mt-1">
                    ✓ Employee found in MR list
                  </p>
                )}
              {loading && (
                <p className="text-gray-500 text-xs mt-1">
                  Loading employee data...
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Employee Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="employeeName"
                  value={formData.employeeName}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-300 rounded bg-gray-100 text-gray-500"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">
                  Autofilled based on employee code
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Employee Mobile number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="employeeMobile"
                  value={formData.employeeMobile}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-300 rounded bg-gray-100 text-gray-500"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">
                  Autofilled based on employee code
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Dr. Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="drCode"
                  placeholder="Enter doctor code"
                  value={formData.drCode}
                  onChange={handleInputChange}
                  className={`w-full p-2 border rounded bg-white text-black placeholder:text-xs ${
                    errors.drCode ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.drCode && (
                  <p className="text-red-500 text-xs mt-1">{errors.drCode}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Dr. First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="drFirstName"
                  placeholder="Eg: Priya and not Dr. Priya"
                  value={formData.drFirstName}
                  onChange={handleInputChange}
                  className={`w-full p-2 border rounded bg-white text-black placeholder:text-xs ${
                    errors.drFirstName ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.drFirstName && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.drFirstName}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">
                  Dr. Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="drLastName"
                  placeholder="Enter doctor's last name"
                  value={formData.drLastName}
                  onChange={handleInputChange}
                  className={`w-full p-2 border rounded bg-white text-black placeholder:text-xs ${
                    errors.drLastName ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {errors.drLastName && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.drLastName}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1 text-gray-700">
                Dr. Mobile number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="drMobile"
                placeholder="Enter 10-digit phone number"
                value={formData.drMobile}
                onChange={handleInputChange}
                className={`w-full p-2 border rounded bg-white text-black ${
                  errors.drMobile ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.drMobile && (
                <p className="text-red-500 text-xs mt-1">{errors.drMobile}</p>
              )}
            </div>

            {/* Doctor's Name for Video - COMMENTED OUT for now
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="block text-sm font-medium mb-1 text-blue-800">
                Doctor&apos;s Name (as it should appear in video){" "}
                <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-blue-600 mb-2">
                Enter the doctor&apos;s name exactly as it should be spoken in
                the video. This name will be used for audio generation.
              </p>
              <input
                type="text"
                name="namePronunciation"
                placeholder="e.g., Dr. Priya Sharma"
                value={formData.namePronunciation}
                onChange={handleInputChange}
                className={`w-full p-2 border rounded bg-white text-black placeholder:text-gray-400 ${
                  errors.namePronunciation
                    ? "border-red-500"
                    : "border-blue-300"
                }`}
              />
              {errors.namePronunciation && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.namePronunciation}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Note: Please ensure the name is spelled correctly as it will be
                used in the final video.
              </p>
            </div>
            */}

            {/* Response Videos */}
            <div className="space-y-6 mt-8">
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium mb-2 text-gray-700">
                  Question 1
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  &quot;Doctor… people say a child with Type-1 diabetes
                  can&apos;t live a normal life — that they&apos;ll always be
                  limited in play, food, and daily activities. Is that
                  true?&quot;
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  &quot;Can a Type-1 child still enjoy childhood and dream of a
                  bright future like any other kid?&quot;
                </p>
                <h4 className="text-sm font-medium mb-2 text-gray-700">
                  Response Video 1
                </h4>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleFileChange(e, "video1")}
                  className={`block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 ${
                    errors.video1 ? "border border-red-500 rounded" : ""
                  }`}
                />
                {errors.video1 && (
                  <p className="text-red-500 text-xs mt-1">{errors.video1}</p>
                )}
                {uploadStatus.video1 && (
                  <p
                    className={`text-sm mt-1 ${
                      uploadStatus.video1.includes("failed")
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {uploadStatus.video1}
                  </p>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium mb-2 text-gray-700">
                  Question 2
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  &quot;Doctor… many people believe that once a child starts
                  insulin, they become dependent on it forever.&quot;
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  &quot;Some even think insulin can harm organs like the
                  kidneys. Is there any truth in this?&quot;
                </p>
                <h4 className="text-sm font-medium mb-2 text-gray-700">
                  Response Video 2
                </h4>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleFileChange(e, "video2")}
                  className={`block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 ${
                    errors.video2 ? "border border-red-500 rounded" : ""
                  }`}
                />
                {errors.video2 && (
                  <p className="text-red-500 text-xs mt-1">{errors.video2}</p>
                )}
                {uploadStatus.video2 && (
                  <p
                    className={`text-sm mt-1 ${
                      uploadStatus.video2.includes("failed")
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {uploadStatus.video2}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-6">
              <button
                type="button"
                className={`py-2 px-6 rounded-md transition-colors font-medium ${
                  isUploading || isUploaded || !formData.employeeName
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
                onClick={handleUpload}
                disabled={isUploading || isUploaded || !formData.employeeName}
              >
                {isUploading
                  ? "Uploading..."
                  : isUploaded
                  ? "Uploaded"
                  : "Upload Videos"}
              </button>
              <button
                type="submit"
                className={`py-2 px-6 rounded-md transition-colors font-medium
                            ${
                              !isUploaded ||
                              isSubmitting ||
                              !formData.employeeName
                                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                : "bg-green-500 hover:bg-green-600 text-white"
                            }
                          `}
                disabled={!isUploaded || isSubmitting || !formData.employeeName}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
            {!formData.employeeName && formData.employeeCode && (
              <p className="text-red-500 text-sm mt-2">
                Please enter a valid Employee Code from the MR list to continue
              </p>
            )}
          </div>

          {/* Right Column - Guidelines */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div>
              <h3 className="font-medium text-lg mb-4 text-gray-800">
                Recording Guidelines/SOP&apos;s for BF&apos;s/MR&apos;s:
              </h3>
              <div className="mb-4">
                <h4 className="font-medium mb-2 text-gray-800">
                  Before the recording:
                </h4>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  <li>
                    Check with the doctor if he/she is prepared with the answers
                    of the two questions.
                  </li>
                  <li>Make sure the background frame is clearly visible.</li>
                  <li>
                    Put the phone in airplane mode. Position camera/phone in
                    static position(horizontal on the tripod stand) at eye level
                    like in above image while recording.
                  </li>
                  <li>Total videos to be recorded are 2 (2 answers video).</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2 text-gray-800">
                  During the recording:
                </h4>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700">
                  <li>
                    Ensure the video is in Landscape format, recorded in full
                    HD, and saved in mp4 or mov format.
                  </li>
                  <li>
                    Record one sample video to check the frame and audio
                    clarity. Change rooms if necessary to reduce outside noise.
                  </li>
                  <li>
                    Avoid repeating questions; signal the doctor with a thumbs
                    up to begin recording.
                  </li>
                  <li>
                    After the doctor finishes answering, wait for 2 seconds
                    before stopping the video.
                  </li>
                  <li>
                    Each video file should contain only 1 answer. Retake if
                    needed.
                  </li>
                  <li>
                    If the doctor fumbles or pauses, redo the video. Ensure the
                    doctor feels comfortable during the recording.
                  </li>
                  <li>
                    Upload all final video files (2 videos) to the designated
                    sections in the provided form link.
                  </li>
                </ul>
              </div>

              <p className="mt-6 text-red-600 font-medium text-sm">
                For any queries/concerns/issues during the shoot, please connect
                with your SPOC&apos;s.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
