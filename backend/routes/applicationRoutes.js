
const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");

const router = express.Router();

const finalStatuses = ["Rejected", "Accepted", "Declined"];

const transitions = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: []
};

// Separate counter for each company.
const counterSchema = new mongoose.Schema({
  companyKey: { type: String, unique: true, required: true },
  sequence: { type: Number, default: 0 }
});

const Counter =
  mongoose.models.ApplicationCounter ||
  mongoose.model("ApplicationCounter", counterSchema);

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
    data: null
  });
}

function isValidDate(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date <= today;
}

function getFollowUpDate(appliedDate) {
  const date = new Date(appliedDate);
  date.setDate(date.getDate() + 7);
  return date;
}

function isOverdue(application) {
  return (
    application.status === "Applied" &&
    new Date() > new Date(application.followUpDate)
  );
}

function formatApplication(application) {
  const data = application.toObject();
  data.isOverdue = isOverdue(application);
  return data;
}

// POST /api/applications — create an application
router.post("/", async (req, res) => {
  try {
    const {
      companyName,
      jobRole,
      jobType,
      appliedDate,
      expectedSalary,
      notes
    } = req.body;

    if (
      !companyName?.trim() ||
      !jobRole?.trim() ||
      !jobType ||
      !appliedDate
    ) {
      return sendError(
        res,
        400,
        "Company, job role, job type and applied date are required."
      );
    }

    if (!isValidDate(appliedDate)) {
      return sendError(
        res,
        400,
        "Applied Date must be valid and cannot be in the future."
      );
    }

    if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
      return sendError(res, 400, "Invalid job type.");
    }

    if (
      expectedSalary !== undefined &&
      expectedSalary !== null &&
      expectedSalary !== "" &&
      (!Number.isFinite(Number(expectedSalary)) ||
        Number(expectedSalary) < 0)
    ) {
      return sendError(res, 400, "Expected salary must be non-negative.");
    }

    const company = companyName.trim();
    const role = jobRole.trim();

    const duplicate = await Application.findOne({
      companyName: { $regex: `^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      jobRole: { $regex: `^${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      status: { $nin: finalStatuses }
    });

    if (duplicate) {
      return sendError(
        res,
        409,
        "An active application for this company and job role already exists."
      );
    }

    const companyKey = company.toLowerCase();

    const counter = await Counter.findOneAndUpdate(
      { companyKey },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const prefix =
      company.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "JOB";

    const applicationId =
      `JA-${prefix}-${String(counter.sequence).padStart(3, "0")}`;

    const applied = new Date(appliedDate);

    const application = await Application.create({
      applicationId,
      companyName: company,
      jobRole: role,
      jobType,
      appliedDate: applied,
      expectedSalary:
        expectedSalary === undefined ||
        expectedSalary === null ||
        expectedSalary === ""
          ? null
          : Number(expectedSalary),
      notes: notes || "",
      status: "Applied",
      followUpDate: getFollowUpDate(applied),
      statusHistory: [{ status: "Applied", date: new Date() }]
    });

    return res.status(201).json({
      success: true,
      message: "Job application created successfully.",
      data: formatApplication(application)
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 400, "Could not create application.");
  }
});

// GET /api/applications — list, search and filter
router.get("/", async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      if (!transitions[req.query.status]) {
        return sendError(res, 400, "Invalid status filter.");
      }
      filter.status = req.query.status;
    }

    if (req.query.company) {
      const escaped = String(req.query.company).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      filter.companyName = { $regex: escaped, $options: "i" };
    }

    const applications = await Application.find(filter).sort({
      createdAt: -1
    });

    return res.json({
      success: true,
      message: "Applications retrieved successfully.",
      data: applications.map(formatApplication)
    });
  } catch (error) {
    return sendError(res, 400, "Could not retrieve applications.");
  }
});

// GET /api/applications/summary — count each status
router.get("/summary", async (req, res) => {
  try {
    const counts = await Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const data = Object.fromEntries(
      Object.keys(transitions).map(status => [status, 0])
    );

    counts.forEach(item => {
      data[item._id] = item.count;
    });

    return res.json({
      success: true,
      message: "Application counts retrieved.",
      data
    });
  } catch (error) {
    return sendError(res, 400, "Could not retrieve application counts.");
  }
});

// GET /api/applications/:id — details and status history
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 404, "Application not found.");
    }

    return res.json({
      success: true,
      message: "Application retrieved successfully.",
      data: formatApplication(application)
    });
  } catch (error) {
    return sendError(res, 400, "Could not retrieve application.");
  }
});

// PUT /api/applications/:id — edit permitted fields only
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 404, "Application not found.");
    }

    const { companyName, jobRole, jobType, expectedSalary, notes } = req.body;

    if (companyName !== undefined) {
      if (!String(companyName).trim()) {
        return sendError(res, 400, "Company name cannot be empty.");
      }
      application.companyName = String(companyName).trim();
    }

    if (jobRole !== undefined) {
      if (!String(jobRole).trim()) {
        return sendError(res, 400, "Job role cannot be empty.");
      }
      application.jobRole = String(jobRole).trim();
    }

    if (jobType !== undefined) {
      if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
        return sendError(res, 400, "Invalid job type.");
      }
      application.jobType = jobType;
    }

    if (expectedSalary !== undefined) {
      if (
        expectedSalary !== null &&
        expectedSalary !== "" &&
        (!Number.isFinite(Number(expectedSalary)) ||
          Number(expectedSalary) < 0)
      ) {
        return sendError(res, 400, "Expected salary must be non-negative.");
      }
      application.expectedSalary =
        expectedSalary === null || expectedSalary === ""
          ? null
          : Number(expectedSalary);
    }

    if (notes !== undefined) application.notes = notes;

    // Applied date and application ID are never updated here.
    await application.save();

    return res.json({
      success: true,
      message: "Application updated successfully.",
      data: formatApplication(application)
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 400, "Could not update application.");
  }
});

// PATCH /api/applications/:id/status — enforce workflow
router.patch("/:id/status", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 404, "Application not found.");
    }

    const { status } = req.body;
    const allowed = transitions[application.status];

    if (!allowed || !allowed.includes(status)) {
      return sendError(
        res,
        400,
        `Cannot change status from ${application.status} to ${status}.`
      );
    }

    application.status = status;
    application.statusHistory.push({
      status,
      date: new Date()
    });

    await application.save();

    return res.json({
      success: true,
      message: "Application status updated successfully.",
      data: formatApplication(application)
    });
  } catch (error) {
    return sendError(res, 400, "Could not update application status.");
  }
});

// DELETE /api/applications/:id
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendError(res, 404, "Application not found.");
    }

    if (
      application.status === "Interview" ||
      application.status === "Offer"
    ) {
      return sendError(
        res,
        400,
        "Applications in Interview or Offer status cannot be deleted."
      );
    }

    await application.deleteOne();

    return res.json({
      success: true,
      message: "Application deleted successfully.",
      data: null
    });
  } catch (error) {
    return sendError(res, 400, "Could not delete application.");
  }
});

module.exports = router;
