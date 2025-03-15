const express = require("express");
const router = express.Router();
const { getNews } = require("../services/scraper");

// Get all news articles
router.get("/", async (req, res) => {
  try {
    const news = await getNews();
    res.json(news);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching news",
      error: error.message,
    });
  }
});

// Get news by topic
router.get("/topic/:topic", async (req, res) => {
  try {
    const news = await getNews();
    if (Array.isArray(news)) {
      const filteredNews = news.filter(
        (article) =>
          article.topic.toLowerCase() === req.params.topic.toLowerCase()
      );
      res.json(filteredNews);
    } else {
      res.json(news); // Pass through any error messages
    }
  } catch (error) {
    res.status(500).json({
      message: "Error fetching news by topic",
      error: error.message,
    });
  }
});

// Get news by source
router.get("/source/:source", async (req, res) => {
  try {
    const news = await getNews();
    if (Array.isArray(news)) {
      const filteredNews = news.filter(
        (article) =>
          article.source.toLowerCase() === req.params.source.toLowerCase()
      );
      res.json(filteredNews);
    } else {
      res.json(news); // Pass through any error messages
    }
  } catch (error) {
    res.status(500).json({
      message: "Error fetching news by source",
      error: error.message,
    });
  }
});

module.exports = router;
