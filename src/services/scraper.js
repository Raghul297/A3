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
    },
  },
  {
    name: "NDTV",
    url: "https://www.ndtv.com/latest",
    selectors: {
      articles: ".news_Itm-cont",
      title: ".newsHdng",
      content: ".newsCont",
    },
  },
  {
    name: "Hindustan Times",
    url: "https://www.hindustantimes.com/india-news",
    selectors: {
      articles: ".storyCard, .hdg3",
      title: "h3 a, .hdg3 a",
      content: ".detail, .storyDetail, .sortDec, .storyParagraph",
      link: "h3 a, .hdg3 a",
    },
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
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    Referer: "https://www.indiatoday.in",
  },
  timeout: 15000,
  withCredentials: true,
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
    const response = await axios.get(source.url);
    const $ = cheerio.load(response.data);
    const articles = [];

    // Only process first 2 articles from each source
    let articleCount = 0;
    $(source.selectors.articles).each((i, element) => {
      if (articleCount >= 2) return false; // Stop after 2 articles

      const titleElement = $(element).find(source.selectors.title);
      const contentElement = $(element).find(source.selectors.content);

      let title = titleElement.text().trim();
      let content = contentElement.text().trim();

      if (title && content) {
        const article = {
          source: source.name,
          title: title || "Untitled Article",
          summary: content ? content.slice(0, 200) + "..." : title,
          topic: categorizeArticle(content || title),
          sentiment: analyzer
            .getSentiment((content || title).split(" "))
            .toFixed(2),
          entities: extractEntities(content || title),
          timestamp: new Date().toISOString(),
        };

        articles.push(article);
        articleCount++;
        console.log(
          `Added article from ${source.name}: ${title.slice(0, 30)}...`
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
    // Only fetch from Times of India for quick response
    const source = sources[0]; // Times of India source
    console.log(`Fetching from ${source.name}...`);
    const articles = await scrapeArticle(source);
    
    if (articles.length > 0) {
      return articles;
    } else {
      return {
        message: "Unable to fetch news at the moment",
        articles: []
      };
    }
  } catch (error) {
    console.error("Error fetching news:", error);
    return {
      message: "Error fetching news",
      error: error.message
    };
  }
};

module.exports = {
  setupNewsScraping,
  getNews,
};
