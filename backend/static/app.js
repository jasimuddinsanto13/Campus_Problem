const API_BASE = window.API_BASE || 'http://127.0.0.1:8001';

const dialog = document.querySelector('#report-dialog');
const reportButton = document.querySelector('#open-report');
const reportForm = document.querySelector('#report-form');
const issueList = document.querySelector('#issue-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-input');
const statusFilter = document.querySelector('#status-filter');

reportButton.addEventListener('click', () => {
  reportForm.reset();
  document.querySelector('#form-feedback').textContent = '';
  dialog.showModal();
});

function updateSummary(summary) {
  document.querySelector('#total-count').textContent = summary.total;
  document.querySelector('#open-count').textContent = summary.open;
  document.querySelector('#progress-count').textContent = summary.in_progress;
  document.querySelector('#resolved-count').textContent = summary.resolved;
}

function issueMarkup(issue) {
  const statusClass = issue.status.toLowerCase().replaceAll(' ', '-');
  const priorityClass = issue.priority.toLowerCase();
  return `<article class="issue-row" data-status="${issue.status}" data-search="${`${issue.title} ${issue.location} ${issue.category}`.toLowerCase()}" data-issue-id="${issue.id}">
    <div class="issue-indicator priority-${priorityClass}"></div>
    <div class="issue-main"><div class="issue-title-line"><h3>${escapeHtml(issue.title)}</h3><span class="status status-${statusClass}">${issue.status}</span></div><p>${escapeHtml(issue.location)} <span class="separator">&bull;</span> ${escapeHtml(issue.category)}</p></div>
    <div class="issue-meta"><span class="priority priority-${priorityClass}">${issue.priority} priority</span><span>${issue.reported}</span></div>
    <button class="row-menu" data-action="advance" title="Advance issue status" aria-label="Advance issue status">&#8942;</button>
  </article>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
}

function filterIssues() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  let visible = 0;
  document.querySelectorAll('.issue-row').forEach((row) => {
    const matchesQuery = row.dataset.search.includes(query);
    const matchesStatus = status === 'All' || row.dataset.status === status;
    row.hidden = !(matchesQuery && matchesStatus);
    if (!row.hidden) visible += 1;
  });
  emptyState.hidden = visible !== 0;
}

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(reportForm);
  const response = await fetch(`${API_BASE}/api/issues`, { method: 'POST', body: formData });
  const result = await response.json();
  const feedback = document.querySelector('#form-feedback');
  if (!response.ok) {
    feedback.textContent = result.error || 'Unable to submit report.';
    return;
  }
  issueList.insertAdjacentHTML('afterbegin', issueMarkup(result.issue));
  updateSummary(result.summary);
  dialog.close();
  filterIssues();
});

issueList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="advance"]');
  if (!button) return;
  const row = button.closest('.issue-row');
  const status = row.dataset.status;
  const nextStatus = { Open: 'In progress', 'In progress': 'Resolved', Resolved: 'Open' }[status];
  const response = await fetch(`${API_BASE}/api/issues/${row.dataset.issueId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) });
  if (!response.ok) return;
  const result = await response.json();
  row.outerHTML = issueMarkup(result.issue);
  updateSummary(result.summary);
  filterIssues();
});

searchInput.addEventListener('input', filterIssues);
statusFilter.addEventListener('change', filterIssues);
