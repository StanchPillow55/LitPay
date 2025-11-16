require('dotenv').config();
const axios = require('axios');

// API endpoints
const CROSSREF_API = 'https://api.crossref.org/works';
const OPENALEX_API = 'https://api.openalex.org/works';
const UNPAYWALL_API = 'https://api.unpaywall.org/v2';

// Required email for polite pool access
const CONTACT_EMAIL = process.env.RESEARCH_CONTACT_EMAIL || 'research@litpay.example.com';

/**
 * Calculate utility score for an article
 * Score = 0.45*relevance + 0.25*citationNorm + 0.15*openAccess + 0.15*recency
 * 
 * @param {Object} article - Article metadata
 * @param {string} query - Original search query
 * @returns {number} Score between 0 and 1
 */
function calculateScore(article, query) {
  // Relevance: simple keyword matching (0-1)
  const queryTerms = query.toLowerCase().split(/\s+/);
  const titleLower = (article.title || '').toLowerCase();
  const abstractLower = (article.abstract || '').toLowerCase();
  
  const titleMatches = queryTerms.filter(term => titleLower.includes(term)).length;
  const abstractMatches = queryTerms.filter(term => abstractLower.includes(term)).length;
  
  const relevance = Math.min(1, (titleMatches * 0.6 + abstractMatches * 0.4) / queryTerms.length);

  // Citation count normalization (0-1, log scale)
  const citations = article.citations || 0;
  const citationNorm = citations > 0 ? Math.min(1, Math.log10(citations + 1) / 3) : 0;

  // Open access (0 or 1)
  const openAccess = article.is_oa ? 1 : 0;

  // Recency decay (0-1, exponential decay over 10 years)
  const currentYear = new Date().getFullYear();
  const articleYear = article.year || currentYear;
  const age = currentYear - articleYear;
  const recency = Math.exp(-age / 10);

  // Weighted score
  const score = 0.45 * relevance + 
                0.25 * citationNorm + 
                0.15 * openAccess + 
                0.15 * recency;

  return Math.round(score * 1000) / 1000; // Round to 3 decimals
}

/**
 * Search Crossref for articles
 * 
 * @param {string} query - Search query
 * @param {number} rows - Number of results
 * @returns {Promise<Array>} Array of article objects
 */
async function searchCrossref(query, rows = 10) {
  try {
    const response = await axios.get(CROSSREF_API, {
      params: {
        query: query,
        rows: rows,
        mailto: CONTACT_EMAIL
      },
      timeout: 10000
    });

    const items = response.data.message.items || [];
    
    return items.map(item => ({
      doi: item.DOI,
      title: item.title?.[0] || 'Untitled',
      authors: item.author?.map(a => `${a.given} ${a.family}`.trim()) || [],
      year: item.published?.['date-parts']?.[0]?.[0] || null,
      journal: item['container-title']?.[0] || 'Unknown',
      citations: item['is-referenced-by-count'] || 0,
      abstract: item.abstract || null,
      is_oa: false, // Will check with Unpaywall
      source: 'crossref'
    }));
  } catch (err) {
    console.error('Crossref search error:', err.message);
    return [];
  }
}

/**
 * Search OpenAlex for articles
 * 
 * @param {string} query - Search query
 * @param {number} perPage - Number of results
 * @returns {Promise<Array>} Array of article objects
 */
async function searchOpenAlex(query, perPage = 10) {
  try {
    const response = await axios.get(OPENALEX_API, {
      params: {
        search: query,
        per_page: perPage,
        mailto: CONTACT_EMAIL
      },
      timeout: 10000
    });

    const results = response.data.results || [];
    
    return results.map(work => ({
      doi: work.doi?.replace('https://doi.org/', ''),
      title: work.title || 'Untitled',
      authors: work.authorships?.map(a => a.author?.display_name).filter(Boolean) || [],
      year: work.publication_year,
      journal: work.primary_location?.source?.display_name || 'Unknown',
      citations: work.cited_by_count || 0,
      abstract: null, // OpenAlex doesn't provide abstracts
      is_oa: work.open_access?.is_oa || false,
      oa_url: work.open_access?.oa_url || null,
      source: 'openalex'
    }));
  } catch (err) {
    console.error('OpenAlex search error:', err.message);
    return [];
  }
}

/**
 * Check Unpaywall for open access availability
 * 
 * @param {string} doi - DOI to check
 * @returns {Promise<Object>} OA status and URL
 */
async function checkUnpaywall(doi) {
  try {
    const response = await axios.get(`${UNPAYWALL_API}/${doi}`, {
      params: { email: CONTACT_EMAIL },
      timeout: 5000
    });

    return {
      is_oa: response.data.is_oa || false,
      oa_url: response.data.best_oa_location?.url || null,
      oa_status: response.data.oa_status || null
    };
  } catch (err) {
    // 404 is common for articles not in Unpaywall
    if (err.response?.status === 404) {
      return { is_oa: false, oa_url: null, oa_status: null };
    }
    console.error(`Unpaywall error for ${doi}:`, err.message);
    return { is_oa: false, oa_url: null, oa_status: null };
  }
}

/**
 * Discover articles from multiple sources
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Ranked array of articles
 */
async function discover(query, options = {}) {
  const {
    maxResults = 20,
    minScore = 0.62,
    checkOA = true
  } = options;

  console.log(`\n🔍 Discovering articles for: "${query}"`);
  console.log(`   Max results: ${maxResults}`);
  console.log(`   Min score threshold: ${minScore}`);

  const startTime = Date.now();

  // Search both sources in parallel
  const [crossrefResults, openalexResults] = await Promise.all([
    searchCrossref(query, Math.ceil(maxResults / 2)),
    searchOpenAlex(query, Math.ceil(maxResults / 2))
  ]);

  console.log(`   Crossref: ${crossrefResults.length} results`);
  console.log(`   OpenAlex: ${openalexResults.length} results`);

  // Merge and deduplicate by DOI
  const doiMap = new Map();
  
  for (const article of [...openalexResults, ...crossrefResults]) {
    if (!article.doi || doiMap.has(article.doi)) continue;
    doiMap.set(article.doi, article);
  }

  let articles = Array.from(doiMap.values());
  console.log(`   Unique articles: ${articles.length}`);

  // Check Unpaywall for OA status if needed
  if (checkOA) {
    console.log('   Checking Unpaywall for OA status...');
    
    const oaChecks = articles.map(async article => {
      if (!article.is_oa && article.doi) {
        const oaData = await checkUnpaywall(article.doi);
        article.is_oa = oaData.is_oa;
        article.oa_url = oaData.oa_url;
        article.oa_status = oaData.oa_status;
      }
      return article;
    });

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < oaChecks.length; i += batchSize) {
      const batch = oaChecks.slice(i, i + batchSize);
      await Promise.all(batch);
      if (i + batchSize < oaChecks.length) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
      }
    }

    const oaCount = articles.filter(a => a.is_oa).length;
    console.log(`   Open access: ${oaCount}/${articles.length}`);
  }

  // Calculate scores
  articles = articles.map(article => ({
    ...article,
    score: calculateScore(article, query)
  }));

  // Filter and sort
  articles = articles
    .filter(a => a.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const duration = Date.now() - startTime;
  console.log(`\n✅ Discovery complete in ${duration}ms`);
  console.log(`   Candidates: ${articles.length} (score >= ${minScore})`);
  
  if (articles.length > 0) {
    console.log(`   Top score: ${articles[0].score} - "${articles[0].title}"`);
    console.log(`   OA available: ${articles.filter(a => a.is_oa).length}`);
  }

  return articles;
}

/**
 * Estimate enrichment cost for articles
 * 
 * @param {Array} articles - Array of articles
 * @param {number} pricePerArticle - Price in cents per article
 * @returns {Object} Cost breakdown
 */
function estimateCost(articles, pricePerArticle = 1) {
  const gatedArticles = articles.filter(a => !a.is_oa);
  const oaArticles = articles.filter(a => a.is_oa);

  return {
    totalArticles: articles.length,
    gatedArticles: gatedArticles.length,
    openAccessArticles: oaArticles.length,
    estimatedCostCents: gatedArticles.length * pricePerArticle,
    pricePerArticle: pricePerArticle,
    breakdown: {
      gated: gatedArticles.map(a => ({
        doi: a.doi,
        title: a.title,
        score: a.score,
        cost: pricePerArticle
      })),
      openAccess: oaArticles.map(a => ({
        doi: a.doi,
        title: a.title,
        score: a.score,
        cost: 0,
        url: a.oa_url
      }))
    }
  };
}

module.exports = {
  discover,
  calculateScore,
  estimateCost,
  searchCrossref,
  searchOpenAlex,
  checkUnpaywall
};
