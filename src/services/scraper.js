const axios = require("axios");
const cheerio = require("cheerio");
const natural = require("natural");
const cron = require("node-cron");

// Initialize sentiment analyzer
const analyzer = new natural.SentimentAnalyzer(
  "English",
  natural.PorterStemmer,
  "afinn"
);

const sources = [
  {
    name: "Times of India",
    url: "https://timesofindia.indiatimes.com/briefs/india",
    selectors: {
      articles: ".brief_box",
      title: ".brief_box h2",
      content: ".brief_box p",
      link: ".brief_box a",
    },
    baseUrl: "https://timesofindia.indiatimes.com",
  },
  {
    name: "NDTV",
    url: "https://www.ndtv.com/india",
    selectors: {
      articles: ".news_list .news_item",
      title: "h2.newsHdng a",
      content: ".newsCont, .desc",
      link: "h2.newsHdng a",
    },
    baseUrl: "https://www.ndtv.com",
  },
  {
    name: "Hindustan Times",
    url: "https://www.hindustantimes.com/india-news",
    selectors: {
      articles: ".listingPage .storyCard",
      title: ".hdg3 a, .card-title a",
      content: ".sortDec",
      link: ".hdg3 a, .card-title a",
    },
    baseUrl: "https://www.hindustantimes.com",
  },
  {
    name: "India Today",
    url: "https://www.indiatoday.in/india",
    selectors: {
      articles: "div.story__grid article",
      title: "h2.story__title a",
      content: "p.story__description",
      link: "h2.story__title a",
    },
  },
  {
    name: "The Hindu",
    url: "https://www.thehindu.com/latest-news/",
    selectors: {
      articles: ".timeline-container .timeline-item",
      title: ".title a, h3 a",
      content: ".intro, .story-card-text",
      link: ".title a, h3 a",
    },
  },
];

// Add more robust headers and cookies
const axiosConfig = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
  timeout: 8000, // Reduced timeout for faster response
  maxRedirects: 5,
};

const categorizeArticle = (text) => {
  const topics = {
    politics: [
      "government",
      "minister",
      "election",
      "party",
      "parliament",
      "policy",
      "congress",
      "bjp",
      "political",
      "leader",
      "democracy",
      "vote",
      "campaign",
    ],
    health: [
      "hospital",
      "medical",
      "health",
      "disease",
      "covid",
      "doctor",
      "vaccine",
      "treatment",
      "patient",
      "medicine",
      "healthcare",
      "wellness",
      "clinic",
    ],
    world: [
      "international",
      "global",
      "foreign",
      "world",
      "diplomatic",
      "embassy",
      "overseas",
      "bilateral",
      "multinational",
      "united nations",
      "summit",
      "treaty",
    ],
  };

  const words = text.toLowerCase().split(" ");
  const scores = {};

  Object.keys(topics).forEach((topic) => {
    scores[topic] = words.filter((word) =>
      topics[topic].some((keyword) => word.includes(keyword))
    ).length;
  });

  return Object.entries(scores).reduce((a, b) => (a[1] > b[1] ? a : b))[0];
};

const extractEntities = (text) => {
  const tokenizer = new natural.WordTokenizer();
  const words = tokenizer.tokenize(text);

  // Simple named entity recognition (can be improved with more sophisticated NLP)
  const states = ["delhi", "mumbai", "kerala", "gujarat", "punjab"];
  const foundStates = states.filter((state) =>
    text.toLowerCase().includes(state)
  );

  // Extract potential person names (words starting with capital letters)
  const persons = words.filter(
    (word) => /^[A-Z][a-z]+$/.test(word) && word.length > 2
  );

  return {
    states: foundStates,
    people: [...new Set(persons)],
  };
};

const scrapeArticle = async (source) => {
  try {
    console.log(`Scraping ${source.name}...`);
    const response = await axios.get(source.url, axiosConfig);
    const $ = cheerio.load(response.data);
    const articles = [];

    // Only process first 2 articles from each source
    let articleCount = 0;
    $(source.selectors.articles).each((i, element) => {
      if (articleCount >= 2) return false; // Stop after 2 articles

      try {
        const titleElement = $(element).find(source.selectors.title);
        const contentElement = $(element).find(source.selectors.content);
        const linkElement = $(element).find(source.selectors.link);

        let title = titleElement.text().trim();
        let content = contentElement.text().trim();
        let link = linkElement.attr("href");

        // Additional validation
        if (!title || title.length < 5) {
          console.log(`Skipping article from ${source.name} - invalid title`);
          return;
        }

        if (!content || content.length < 10) {
          content = title; // Use title as content if no content found
        }

        // Process the URL to ensure it's absolute
        if (link) {
          if (!link.startsWith("http")) {
            // Remove leading slash if present since baseUrl might end with one
            link = link.startsWith("/") ? link.substring(1) : link;
            // Combine baseUrl with relative link
            link = `${source.baseUrl}/${link}`;
          }
        } else {
          console.log(`No link found for article from ${source.name}`);
          return; // Skip articles without links
        }

        const article = {
          source: source.name,
          title: title,
          summary: content.slice(0, 200) + "...",
          topic: categorizeArticle(content),
          sentiment: analyzer.getSentiment(content.split(" ")).toFixed(2),
          entities: extractEntities(content),
          timestamp: new Date().toISOString(),
          url: link,
        };

        articles.push(article);
        articleCount++;
        console.log(
          `Added article from ${source.name}: ${title.slice(0, 30)}...`
        );
      } catch (err) {
        console.error(
          `Error processing article from ${source.name}:`,
          err.message
        );
      }
    });

    console.log(`Scraped ${articles.length} articles from ${source.name}`);
    return articles;
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error.message);
    return [];
  }
};

const updateNews = async () => {
  console.log("Starting news update...");
  let allArticles = [];

  for (const source of sources) {
    console.log(`Processing source: ${source.name}`);
    const articles = await scrapeArticle(source);
    allArticles.push(...articles);
  }

  console.log(`Update complete. Total articles: ${allArticles.length}`);
  console.log("First article:", allArticles[0]); // Log first article for verification
};

const setupNewsScraping = () => {
  console.log("News scraping ready - will fetch on demand");
};

const getNews = async () => {
  console.log("getNews called - fetching fresh news");
  try {
    // Select three fastest sources
    const selectedSources = [
      sources[0], // Times of India
      sources[1], // NDTV
      sources[2], // Hindustan Times
    ];

    // Fetch from all sources in parallel
    const newsPromises = selectedSources.map(async (source) => {
      console.log(`Fetching from ${source.name}...`);
      try {
        const articles = await scrapeArticle(source);
        return articles;
      } catch (error) {
        console.error(`Error fetching from ${source.name}:`, error.message);
        return []; // Return empty array if source fails
      }
    });

    // Wait for all sources to complete
    const results = await Promise.all(newsPromises);
    const allArticles = results.flat();

    if (allArticles.length > 0) {
      // Sort by timestamp to show newest first
      allArticles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      console.log(`Successfully fetched ${allArticles.length} articles`);
      return allArticles;
    } else {
      return {
        message: "Unable to fetch news at the moment",
        articles: [],
      };
    }
  } catch (error) {
    console.error("Error fetching news:", error);
    return {
      message: "Error fetching news",
      error: error.message,
    };
  }
};

module.exports = {
  setupNewsScraping,
  getNews,
};
