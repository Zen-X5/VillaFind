const express = require("express");
const router = express.Router();
const User = require('../models/user');
const passport = require("passport");
const { saveRedirectUrl } = require("../routers/middleware");


router.get(`/signup`,(req,res)=>{
    res.render(`../views/listings/signup.ejs`);
});
router.post("/signup",async(req,res)=>{
    try{
        let {username,email,password} = req.body;
        const newUser = new User({username,email});
        const registeredUser = await User.register(newUser,password);
        console.log(registeredUser);
        req.login(registeredUser,(err)=>{
            if(err){
                next(err);
            }
            req.flash("success","Welcome to VillaFind");
            res.redirect("/listings");
        })
    }catch(e){
        req.flash("error",e.message);
        res.redirect(`/signup`);
    }
});
router.get(`/login`,(req,res)=>{
    res.render(`../views/listings/login.ejs`);
});
router.post(`/login`,saveRedirectUrl,passport.authenticate("local",{
    failureRedirect : "/login",
    failureFlash : true,
}),async(req,res)=>{
    let redirectUrl = res.locals.redirectUrl || "/listings";
    req.flash("success","Welcome back to VillaFind");
    res.redirect(redirectUrl);
});
router.get(`/logout`,(req,res,next)=>{
    req.logout((err)=>{
        if(err){
            return next(err);
        }
        req.flash("success","You logged out");
        res.redirect("/listings");
    })
});
module.exports = router;