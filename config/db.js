const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB connecté !");
    } catch (err) {
        console.error(err.message);
        process.exit(1); // Arrête le serveur si la connexion échoue
    }
};

module.exports = connectDB;
//"mongodb+srv://necibsamir:Jesuisneleneufjuin1985@cluster0.i1d1jkk.mongodb.net/moviedb?retryWrites=true&w=majority", pour .env si besoin
