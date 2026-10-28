
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },
    companyName: {
      type: String,
      required: true,
      trim: true
    },
    jobRole: {
      type: String,
      required: true,
      trim: true
    },
    jobType: {
      type: String,
      required: true,
      enum: ["Full-time", "Internship", "Contract"]
    },
    appliedDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          return value <= today;
        },
        message: "Applied Date cannot be in the future"
      }
    },
    expectedSalary: {
      type: Number,
      min: 0,
      default: null
    },
    notes: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: [
        "Applied",
        "Interview",
        "Offer",
        "Accepted",
        "Rejected",
        "Declined"
      ],
      default: "Applied"
    },
    followUpDate: {
      type: Date,
      required: true
    },
    statusHistory: [
      {
        status: {
          type: String,
          required: true
        },
        date: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", applicationSchema);
