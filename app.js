if(process.env.NODE_ENV != "production"){
    require('dotenv').config();
}
const express = require("express");
const mongoose = require('mongoose');
const path = require('path');
const Listing = require("./models/listings.js");
const Review = require("./models/reviews.js");
const methodOverride = require('method-override');
const engine = require('ejs-mate');
const ExpressError = require("./utils/ExpressError.js");
const wrapAsync = require("./utils/wrapAsync.js");
let { listingSchema, reviewSchema } = require("./schema.js");
const session = require('express-session');
const flash = require('express-flash');
const passport = require(`passport`);
const User = require("./models/user.js");
const LocalStrategy = require("passport-local");
const { isLoggedIn, isOwner, isAuthor } = require("./routers/middleware.js");
const multer = require('multer');
const {storage} = require("./cloudConfig.js");
const upload = multer({ storage: storage }); // Correct Multer Initialization
//Geocoding
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const MongoStore = require('connect-mongo');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken});

const app = express();
const port = 8080;

app.listen(port, () => {
    console.log(`Server is listening on port ${port}...`);
});
const dbUrl = process.env.ATLASDB_URL;
app.use(express.static(path.join(__dirname, "public")));

const store = MongoStore.create({
    mongoUrl : dbUrl,
    crypto :  {
        secrete : process.env.SECRET,
    },
    touchAfter : 24*3600, //in seconds(1day)
});

const sessionOption = {
    store,
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    }
};

store.on("error",()=>{
    console.log("Error in MONGO SESSION STORE",err);
});

app.use(flash());
app.use(session(sessionOption));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.engine('ejs', engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

main().then((res) => {
    console.log("Connection with database was successful...");
}).catch((err) => {
    console.log(err);
})
// 'mongodb://127.0.0.1:27017/villaFind'
async function main() {
    mongoose.connect(dbUrl);
}

const validateListing = (req, res, next) => {
    let { error } = listingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(", ");
        return next(new ExpressError(400, errMsg)); // Use return here
    } else {
        next();
    }
};

const validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body); // This should work if req.body has the correct structure
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(", ");
        return next(new ExpressError(400, errMsg)); // Use return here
    } else {
        next();
    }
};

app.use((req, res, next) => {
    res.locals.successMsg1 = req.flash("success1");
    res.locals.successMsg2 = req.flash("successdel");
    res.locals.currUser = req.user;
    next();
})

app.use("/", require(`./routers/user.js`));

app.get(`/`, (req, res) => {
    res.send("Hi, I am root");
});

app.use((req, res, next) => {
    res.locals.successMsg = req.flash("success");
    res.locals.errorMsg = req.flash("error");
    res.locals.successMsg3 = req.flash("success3");
    next();
});

app.get(`/listings`, wrapAsync(async (req, res) => {
    try {
        const allListings = await Listing.find({});
        res.render("./listings/home.ejs", { allListings });
    } catch (err) {
        console.error(err);
        res.status(500).render("./listings/error.ejs", { status: 500, message: "An error occurred" });
    }
}));

app.get('/listings/new', isLoggedIn, (req, res) => {
    res.render("./listings/new.ejs");
});

app.post("/listing/new", isLoggedIn, upload.single('image'), validateListing, wrapAsync(async (req, res) => {
    console.log("File uploaded:", req.file);
    console.log("Form data:", req.body);

    if (!req.file) {
        req.flash("error", "Please upload an image.");
        return res.redirect("/listings/new"); // Redirect back to the form
    }

    try {
        let response  =await  geocodingClient.forwardGeocode({
            query: req.body.location,
            limit: 1,
          })
        .send()

        let { title, description, price, location, country } = req.body;
        // Access the uploaded image details from req.file
        const url = req.file.path; // or req.file.filename, depending on your storage setup
        const filename = req.file.filename;

        const listing = new Listing({
            title: title,
            description: description,
            image: { url,filename }, // Store image info
            price: price,
            location: location,
            country: country,
            owner: req.user._id,
        });
        listing.geometry = response.body.features[0].geometry;
        await listing.save();
        console.log(`New Listing added : ${listing}`);
        req.flash("success", "New listing added successfully!");
        return res.redirect("/listings");
    } catch (err) {
        console.error(err);
        req.flash("error", "Failed to create listing.");
        return res.status(500).send("An error occurred");
    }
}));

app.get(`/listings/:id`, wrapAsync(async (req, res) => {
    try {
        let { id } = req.params;
        let listing = await Listing.findById(id).populate({ path: "reviews", populate: { path: "author" } }).populate("owner");
        if (!listing) {
            req.flash("error", "Listing you are looking for is not available!");
            return res.redirect("/listings");
        } else {
            res.render(`./listings/show.ejs`, { listing });
        }
    } catch (err) {
        console.error(err);
        res.status(500).render("./listings/error.ejs", { status: 500, message: "An error occurred" });
    }
}));

app.get(`/listing/:id/edit`, isLoggedIn, wrapAsync(async (req, res) => {
    try {
        let { id } = req.params;
        let listing = await Listing.findById(id);
        let originalImageUrl = listing.image.url;
        originalImageUrl = originalImageUrl.replace("/upload","/upload/w_250");
        res.render(`./listings/edit.ejs`, { listing ,originalImageUrl});
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
    }
}));

app.patch('/listing/:id',  isOwner,upload.single('image'),validateListing, wrapAsync(async (req, res) => {
    try {
        let url = req.file.path;
        let filename  = req.file.filename;
        let { id } = req.params;
        let { title, description, price, location, country } = req.body;
        const listing = await Listing.findByIdAndUpdate(id, {
            title: title,
            description: description,
            price: price,
            location: location,
            country: country,
        });
        if(typeof req.file !=="undefined"){
            listing.image = {url,filename}
            await listing.save();
        }
        console.log(`Updated : ${listing}`);
        return res.redirect("/listings");
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
    }
}));

app.delete(`/listing/:id`, isLoggedIn, isOwner, wrapAsync(async (req, res) => {
    try {
        let { id } = req.params;
        let dellisting = await Listing.findByIdAndDelete(id);
        console.log(`Deleted listing : ${dellisting}`);
        req.flash("success3", "Listing deleted successfully!");
        return res.redirect("/listings");
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
    }
}));

app.post("/listings/:id/reviews", isLoggedIn, validateReview, wrapAsync(async (req, res) => {
    try {
        let { id } = req.params;
        let { rating, comment } = req.body.review; // Accessing the nested structure
        let listing = await Listing.findById(id);
        if (!listing) {
            throw new ExpressError(404, "Listing not found");
        }

        let newReview = new Review({
            rating: rating,
            comment: comment,
        });
        newReview.author = req.user._id; // Passing the author to the new review
        listing.reviews.push(newReview);
        await newReview.save();
        await listing.save();
        console.log("New review received.");
        req.flash("success1", "New review added successfully!");
        return res.redirect(`/listings/${listing.id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
    }
}));

app.delete(`/listing/:id/review/:reviewId`, isLoggedIn, isAuthor, wrapAsync(async (req, res) => {
    try {
        let { id, reviewId } = req.params;
        await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
        await Review.findByIdAndDelete(reviewId);
        req.flash("successdel", "Review deleted successfully!");
        return res.redirect(`/listings/${id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("An error occurred");
    }
}));

app.all("*", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
});

app.use((err, req, res, next) => {
    let { status = 500, message = "Something went wrong" } = err;
    res.status(status).render("./listings/error.ejs", { status, message });
});
