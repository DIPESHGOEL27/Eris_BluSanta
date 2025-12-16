const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Import routes
const assessmentRoutes = require("./routes/assessments");
const storageRoutes = require("./routes/storage");
const whatsappRoutes = require("./routes/whatsapp");
const blusantaGeneration = require("./routes/blusanta-generation");
const dbAdminRoutes = require("./routes/db-admin");

// Initialize app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use("/api", assessmentRoutes);
app.use("/api", storageRoutes);
app.use("/api", whatsappRoutes);
app.use("/api", blusantaGeneration);
app.use("/", dbAdminRoutes); // Database admin interface

// Basic route for testing
app.get("/", (req, res) => {
  res.send("BluSanta Assessment API is running");
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "blusanta-backend",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`BluSanta server running on port ${PORT}`);
});
