const mongoose = require('mongoose');
const Listing = require("../models/listings.js");
const initdata = require("./data.js");
const path = require("path");
main().then((res)=>{
    console.log("Connection with database was successful...");
}).catch((err)=>{
    console.log(err);
})
async function main(){
    mongoose.connect('mongodb://127.0.0.1:27017/villaFind');
}

const initDB = async ()=>{
    await Listing.deleteMany({});
    initdata.data = initdata.data.map((obj)=>({...obj,owner : "67c096a5b40512271379f914"}));
    await Listing.insertMany(initdata.data);
    console.log("All previous data is removed and sample data is added..");
}

initDB();
