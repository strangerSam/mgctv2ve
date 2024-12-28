const express = require("express");
const router = express.Router();
const Movie = require("../models/Movie");
const User = require("../models/User");

// Route pour récupérer l'image du jour
router.get("/daily-movie", async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10); // Format : YYYY-MM-DD
        let movie = await Movie.findOne({ date: today });

        if (!movie) {
            // Si aucun film n'est prévu pour aujourd'hui, en choisir un aléatoire
            const randomMovie = await Movie.aggregate([{ $sample: { size: 1 } }]);
            movie = randomMovie[0];
        }

        res.json(movie);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Route pour vérifier la réponse
router.post("/check-answer", async (req, res) => {
    const { answer, movieId } = req.body;

    try {
        const movie = await Movie.findById(movieId);
        if (movie.title.toLowerCase() === answer.toLowerCase()) {
            return res.json({ success: true, message: "Bonne réponse !" });
        } else {
            return res.json({ success: false, message: "Mauvaise réponse, essayez encore !" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// Route pour enregistrer les informations utilisateur
router.post("/submit-user", async (req, res) => {
    const { name, email, solanaAddress } = req.body;

    try {
        await User.create({ name, email, solanaAddress });
        res.json({ message: "Vos informations ont été enregistrées avec succès !" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

module.exports = router;
