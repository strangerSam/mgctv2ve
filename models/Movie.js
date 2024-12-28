const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true },
    screenshot: { type: String, required: true },
    date: { type: String, required: true }, // Format : YYYY-MM-DD
});

module.exports = mongoose.model("Movie", movieSchema);
