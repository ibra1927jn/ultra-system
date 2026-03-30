/**
 * Pure functions for building Adzuna API request parameters.
 * Extracted from scraper.js to deduplicate fetchAdzuna/searchAdzuna.
 */

const ADZUNA_BASE_URL = 'https://api.adzuna.com/v1/api/jobs/nz/search/1';
const ADZUNA_USER_AGENT = 'UltraSystem/1.0';

/**
 * Build URLSearchParams for an Adzuna API request.
 * @param {object} opts
 * @param {string} opts.appId - Adzuna app ID
 * @param {string} opts.appKey - Adzuna app key
 * @param {string} [opts.what] - Exact keyword search (AND)
 * @param {string} [opts.what_or] - OR keyword search
 * @param {string} opts.where - Location
 * @param {number} [opts.resultsPerPage=20]
 * @param {string} [opts.sortBy='date']
 * @param {number} [opts.maxDaysOld=30]
 * @returns {URLSearchParams}
 */
function buildAdzunaParams({ appId, appKey, what, what_or, where, resultsPerPage = 20, sortBy = 'date', maxDaysOld = 30 }) {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(resultsPerPage),
    where,
    sort_by: sortBy,
    max_days_old: String(maxDaysOld),
  });

  if (what_or) params.set('what_or', what_or);
  if (what) params.set('what', what);

  return params;
}

/**
 * Build the full Adzuna API URL.
 * @param {object} opts - Same as buildAdzunaParams
 * @returns {string}
 */
function buildAdzunaUrl(opts) {
  return `${ADZUNA_BASE_URL}?${buildAdzunaParams(opts)}`;
}

/**
 * Extract normalized job data from an Adzuna API result item.
 * @param {object} job - Raw Adzuna job object
 * @returns {{ url: string, title: string, company: string, description: string|null }}
 */
function normalizeAdzunaJob(job) {
  return {
    url: job.redirect_url || job.url || '',
    title: job.title || '',
    company: job.company ? job.company.display_name : '',
    description: job.description ? job.description.substring(0, 500) : null,
  };
}

module.exports = { buildAdzunaParams, buildAdzunaUrl, normalizeAdzunaJob, ADZUNA_BASE_URL, ADZUNA_USER_AGENT };
