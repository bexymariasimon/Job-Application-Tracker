import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api/applications";

const emptyForm = {
  companyName: "",
  jobRole: "",
  jobType: "Full-time",
  appliedDate: new Date().toISOString().slice(0, 10),
  expectedSalary: "",
  notes: "",
};

const transitions = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Accepted: [],
  Rejected: [],
  Declined: [],
};

function App() {
  const [applications, setApplications] = useState([]);
  const [summary, setSummary] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      throw new Error(result.message || "Something went wrong");
    }

    return result;
  }

  async function loadApplications() {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("company", search.trim());
      if (filter !== "All") query.set("status", filter);

      const result = await request(`${API}?${query.toString()}`);
      setApplications(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message || "Cannot connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const result = await request(`${API}/summary`);
      setSummary(result.data || {});
    } catch {
      setSummary({});
    }
  }

  useEffect(() => {
    loadApplications();
    loadSummary();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadApplications();
    }, 300);

    return () => clearTimeout(timer);
  }, [search, filter]);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (form.appliedDate > new Date().toISOString().slice(0, 10)) {
      setError("Applied date cannot be in the future.");
      return;
    }

    const payload = {
      companyName: form.companyName.trim(),
      jobRole: form.jobRole.trim(),
      jobType: form.jobType,
      appliedDate: form.appliedDate,
      expectedSalary: form.expectedSalary === "" ? null : Number(form.expectedSalary),
      notes: form.notes.trim(),
    };

    try {
      if (editingId) {
        await request(`${API}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Application updated successfully!");
      } else {
        await request(API, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Application added successfully!");
      }

      setForm(emptyForm);
      setEditingId(null);
      await loadApplications();
      await loadSummary();
    } catch (err) {
      setError(err.message || "Unable to save application.");
    }
  }

  function startEdit(application) {
    setEditingId(application._id);
    setForm({
      companyName: application.companyName || "",
      jobRole: application.jobRole || "",
      jobType: application.jobType || "Full-time",
      appliedDate: application.appliedDate
        ? String(application.appliedDate).slice(0, 10)
        : emptyForm.appliedDate,
      expectedSalary: application.expectedSalary ?? "",
      notes: application.notes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setMessage("");
  }

  async function changeStatus(application, status) {
    setMessage("");
    setError("");

    try {
      await request(`${API}/${application._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setMessage(`Status changed to ${status}.`);
      await loadApplications();
      await loadSummary();

      if (selected?._id === application._id) {
        const result = await request(`${API}/${application._id}`);
        setSelected(result.data);
      }
    } catch (err) {
      setError(err.message || "Unable to update status.");
    }
  }

  async function deleteApplication(application) {
    if (!window.confirm(`Delete the application for ${application.companyName}?`)) {
      return;
    }

    setMessage("");
    setError("");

    try {
      await request(`${API}/${application._id}`, { method: "DELETE" });
      setMessage("Application deleted successfully!");
      if (selected?._id === application._id) setSelected(null);
      await loadApplications();
      await loadSummary();
    } catch (err) {
      setError(err.message || "Unable to delete this application.");
    }
  }

  async function viewDetails(application) {
    try {
      const result = await request(`${API}/${application._id}`);
      setSelected(result.data);
    } catch (err) {
      setError(err.message || "Unable to load application details.");
    }
  }

  function isOverdue(application) {
    if (application.status !== "Applied" || !application.followUpDate) {
      return false;
    }

    const followUp = new Date(application.followUpDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    followUp.setHours(0, 0, 0, 0);

    return followUp < today;
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const countFor = (status) => {
    const value = summary[status];
    if (typeof value === "number") return value;
    if (value && typeof value.count === "number") return value.count;
    return applications.filter((item) => item.status === status).length;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home">
          <span className="brand-icon">JT</span>
          <span>
            <strong>JobTrack</strong>
            <small>Job Application Tracker</small>
          </span>
        </a>
        <span className="topbar-label">Your career, organized.</span>
      </header>

      <main className="main-content" id="home">
        <section className="welcome">
          <div>
            <p className="eyebrow">YOUR CAREER DASHBOARD</p>
            <h1>Keep every opportunity <span>in sight.</span></h1>
            <p className="welcome-text">
              Track applications, manage interview progress, and stay on top
              of your next career move.
            </p>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span>✓</span>
            <div className="art-line line-one" />
            <div className="art-line line-two" />
            <div className="art-line line-three" />
          </div>
        </section>

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        <section className="stats-grid">
          {[
            { label: "Total applications", status: "All", icon: "▤" },
            { label: "Applied", status: "Applied", icon: "↗" },
            { label: "Interviews", status: "Interview", icon: "▣" },
            { label: "Offers", status: "Offer", icon: "✦" },
            { label: "Accepted", status: "Accepted", icon: "✓" },
          ].map((item) => (
            <button
              className={`stat-card ${filter === item.status ? "stat-active" : ""}`}
              key={item.status}
              onClick={() => setFilter(item.status)}
              type="button"
            >
              <span className="stat-icon">{item.icon}</span>
              <span className="stat-label">{item.label}</span>
              <strong className="stat-number">
                {item.status === "All"
                  ? Object.values(summary).some((v) => typeof v === "number")
                    ? Object.values(summary).reduce(
                        (total, value) =>
                          typeof value === "number" ? total + value : total,
                        0
                      )
                    : applications.length
                  : countFor(item.status)}
              </strong>
            </button>
          ))}
        </section>

        <section className="content-grid">
          <div className="panel form-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editingId ? "EDIT DETAILS" : "NEW OPPORTUNITY"}</p>
                <h2>{editingId ? "Edit application" : "Add application"}</h2>
              </div>
              <span className="heading-symbol">＋</span>
            </div>

            <form onSubmit={handleSubmit} className="application-form">
              <label>
                Company name *
                <input
                  name="companyName"
                  value={form.companyName}
                  onChange={updateForm}
                  placeholder="e.g. Google"
                  required
                  maxLength={100}
                />
              </label>

              <label>
                Job role *
                <input
                  name="jobRole"
                  value={form.jobRole}
                  onChange={updateForm}
                  placeholder="e.g. Frontend Developer"
                  required
                  maxLength={100}
                />
              </label>

              <div className="form-row">
                <label>
                  Job type *
                  <select name="jobType" value={form.jobType} onChange={updateForm}>
                    <option>Full-time</option>
                    <option>Internship</option>
                    <option>Contract</option>
                  </select>
                </label>

                <label>
                  
Applied date *
<input
  type="date"
  name="appliedDate"
  value={form.appliedDate}
  onChange={updateForm}
  max={new Date().toISOString().slice(0, 10)}
  disabled={Boolean(editingId)}
  required
/>

                </label>
              </div>

              <label>
                Expected salary <span className="optional">(optional)</span>
                <input
                  type="number"
                  name="expectedSalary"
                  value={form.expectedSalary}
                  onChange={updateForm}
                  placeholder="e.g. 450000"
                  min="0"
                />
              </label>

              <label>
                Notes <span className="optional">(optional)</span>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateForm}
                  placeholder="Recruiter details, interview preparation..."
                  rows="3"
                  maxLength={2000}
                />
              </label>

              <button className="primary-button" type="submit">
                {editingId ? "Save changes" : "＋ Add application"}
              </button>

              {editingId && (
                <button className="secondary-button" type="button" onClick={cancelEdit}>
                  Cancel editing
                </button>
              )}
            </form>
          </div>

          <div className="panel list-panel">
            <div className="panel-heading list-heading">
              <div>
                <p className="eyebrow">YOUR JOB SEARCH</p>
                <h2>Applications</h2>
              </div>
              <span className="result-count">{applications.length} shown</span>
            </div>

            <div className="search-filter">
              <div className="search-box">
                <span>⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search company..."
                  aria-label="Search company"
                />
              </div>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter by status"
              >
                <option>All</option>
                {Object.keys(transitions).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="empty-state"><span className="loader" /> Loading applications...</div>
            ) : applications.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">▤</span>
                <h3>No applications found</h3>
                <p>Add your first job application using the form.</p>
              </div>
            ) : (
              <div className="application-list">
                {applications.map((application) => (
                  <article className="application-card" key={application._id}>
                    <div className="application-top">
                      <div className="company-avatar">
                        {(application.companyName || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="company-details">
                        <h3>{application.companyName}</h3>
                        <p>{application.jobRole}</p>
                      </div>
                      <span className={`status-badge status-${application.status?.toLowerCase()}`}>
                        {application.status}
                      </span>
                    </div>

                    <div className="application-meta">
                      <span>{application.jobType}</span>
                      <span>Applied {formatDate(application.appliedDate)}</span>
                      {application.applicationId && (
                        <span className="application-id">{application.applicationId}</span>
                      )}
                    </div>

                    {isOverdue(application) && (
                      <div className="overdue-badge">⚠ Follow-up overdue · {formatDate(application.followUpDate)}</div>
                    )}

                    <div className="card-actions">
                      <button className="text-button" onClick={() => viewDetails(application)}>
                        View timeline
                      </button>
                      <button className="text-button" onClick={() => startEdit(application)}>
                        Edit
                      </button>
                      {transitions[application.status]?.length > 0 && (
                        <select
                          className="status-select"
                          value=""
                          onChange={(event) => {
                            if (event.target.value) changeStatus(application, event.target.value);
                          }}
                          aria-label={`Update status for ${application.companyName}`}
                        >
                          <option value="">Update status</option>
                          {transitions[application.status].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      )}
                      {(application.status !== "Interview" && application.status !== "Offer") && (
                        <button
                          className="delete-button"
                          onClick={() => deleteApplication(application)}
                          title="Delete application"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        {selected && (
          <div className="modal-backdrop" onClick={() => setSelected(null)}>
            <section
              className="detail-modal"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Application details"
            >
              <button className="modal-close" onClick={() => setSelected(null)}>×</button>
              <p className="eyebrow">APPLICATION DETAILS</p>
              <h2>{selected.companyName}</h2>
              <p className="detail-role">{selected.jobRole}</p>

              <div className="detail-facts">
                <div><small>Application ID</small><strong>{selected.applicationId || "—"}</strong></div>
                <div><small>Job type</small><strong>{selected.jobType}</strong></div>
                <div><small>Applied date</small><strong>{formatDate(selected.appliedDate)}</strong></div>
                <div><small>Follow-up date</small><strong>{formatDate(selected.followUpDate)}</strong></div>
                <div><small>Expected salary</small><strong>{selected.expectedSalary == null ? "Not provided" : Number(selected.expectedSalary).toLocaleString("en-IN")}</strong></div>
              </div>

              {selected.notes && (
                <div className="notes-box"><strong>Notes</strong><p>{selected.notes}</p></div>
              )}

              <h3 className="timeline-title">Status history</h3>
              <div className="timeline">
                {(selected.statusHistory || []).map((entry, index) => (
                  <div className="timeline-entry" key={`${entry.status}-${index}`}>
                    <span className="timeline-dot" />
                    <div><strong>{entry.status}</strong><p>{formatDate(entry.date)}</p></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <footer className="footer">
        <strong>JobTrack</strong><span>Stay organized. Keep moving forward.</span>
      </footer>
    </div>
  );
}

export default App;