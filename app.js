const express = require("express");
const bodyParser = require('body-parser');
const ejs = require('ejs');
const app = express();
const csv = require('csv-parser');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const saltRounds = 10;

var connectionInitialized = false;
var connectionUsername = '';
var redirectToHomeSource = "user";

app.use(bodyParser.urlencoded({
  extended: true
}));

app.set('view engine', 'ejs');
app.use(express.static("public"));


/* Initialize Database Connection */
mongoose.connect("mongodb+srv://admin-sherif:test-admin-user@csv-cluster.pjrqq.mongodb.net/csvDataDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set('useCreateIndex', true); //To solve deprication issue

/* Create Data Schema and Model */
const dataShema = new mongoose.Schema({
  clientId: String,
  clientName: String,
  dealId: String,
  dealName: String,
  date: String,
  accepted: Number,
  refused: Number
});
const Data = mongoose.model("Data", dataShema);

/* Create Connection Schema and Model */
const connectionSchema = new mongoose.Schema({
  username: String,
  password: String,
  data: [dataShema]
});
const Connection = mongoose.model("Connection", connectionSchema);

app.get("/", function(req, res) {
  // when first time to open the page
  if (redirectToHomeSource === "user") {
    var connectionInitialized = false;
    var connectionUsername = '';
    res.render("index", {
      showData: false,
      showAlert: false
    });
  }
});

app.post("/csv", function(req, res) {
  // When CSV file is uploaded

  if (connectionInitialized) {
    // Read CSV file
    const fileRows = [];
    fs.createReadStream(req.body.csv)
      .pipe(csv())
      .on('data', function(data) {
        fileRows.push(data);
      })
      .on('end', function() {
        console.log('CSV file successfully processed');
        var dataObjects = [];
        for (var i = 0; i < fileRows.length; i++) {
          // Split First column to seperate client name and id
          var client = fileRows[i].client.split("@");
          // Split First column to seperate deal name and id
          var deal = fileRows[i].deal.split("#");
          // Create Object to be stored in database
          var dataObject = new Data({
            clientId: client[1],
            clientName: client[0],
            dealId: deal[1],
            dealName: deal[0],
            date: fileRows[i].hour,
            accepted: fileRows[i].accepted,
            refused: fileRows[i].refused
          });
          dataObjects.push(dataObject);
        }

        // Get the database connection username
        // Update it with the uploaded CSV data
        Connection.updateOne({
          username: connectionUsername
        }, {
          data: dataObjects
        }, function(err) {
          if (err) {
            console.log(err);
            res.render("index",{showAlert: true, alertState:'danger', alertMessage:'Error in uploading file'});
          } else {
            console.log("Added Succesfully");
            // Fetch the data after storing it, to be displayed
            Connection.findOne({
              username: connectionUsername
            }, function(err, foundObject) {
              if (foundObject) {
                res.render("index", {
                  dataObjects: foundObject.data,
                  showData: true,
                  countIndex: 1,
                  showAlert: true,
                  alertState: "success",
                  alertMessage: "Data imported successfully"
                });
              } else {
                res.render("index",{showAlert: true, alertState:'danger', alertMessage:'Error in uploading file'});
              }
            });

          }
        });

      }).on ('error', (err) =>{
        console.log(err.message);
        console.log(err.stack);
        res.render("index",{showAlert: true, alertState:'danger', alertMessage:'Error in uploading file'});
      });
  } else {
    // If no connection initialized, force user to Initialize
    // Render the page again with alert indicating this message
    res.render("index", {
      showData: false,
      countIndex: 1,
      showAlert: true,
      alertState: "danger",
      alertMessage: "Create Database Collection First."
    });
  }
});

// Initialize Databse collection
app.post("/initConnection", function(req, res) {
  // Check if database name already exists
  Connection.findOne({
    username: req.body.username
  }, function(err, foundObject) {
    if (foundObject) {
      bcrypt.compare(req.body.password, foundObject.password, function(err, result) {

        if (result) {
          // If user entered Databse name and password correctly
          connectionInitialized = true;
          connectionUsername = req.body.username;

          if (foundObject.data.length > 0) {
            // If there is csv data stored
            // Then show it
            res.render("index", {
              dataObjects: foundObject.data,
              showData: true,
              countIndex: 1,
              showAlert: true,
              alertState: "success",
              alertMessage: "Database Collection already exists."
            });
          } else {
            // If no data stored, then render this alert message asking user to update some
            res.render("index", {
              showData: false,
              showAlert: true,
              alertState: "success",
              alertMessage: "Database collection already exists. Upload CSV file to show data."
            });
          }
        } else {
          // If user entered wrong password
          res.render("index", {
            showData: false,
            showAlert: true,
            alertState: "danger",
            alertMessage: "Database Collection name already exists. Enter correct password."
          });
        }
      })
    } else {
      // If database is not initialized
      // Create one by storing username and hash the password using hash and salting
      bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
        var connectionObject = new Connection({
          username: req.body.username,
          password: hash,
          data: []
        });
        connectionObject.save();
        connectionInitialized = true;
        connectionUsername = req.body.username;
        console.log("Added Connection");
        console.log(connectionInitialized + " from Add Connection");
        //Show success Init message
        res.render("index", {
          showData: false,
          showAlert: true,
          alertState: "success",
          alertMessage: "Database Collection created successfully."
        });
      });
    }
  });
});

app.post("/dropDatabase", function(req, res) {
  // If already the user is opening a database connection
  if (connectionUsername) {
    // Drop it
    Connection.deleteOne({
      username: connectionUsername
    }, function(err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Database collection dropped successfully");
        connectionInitialized = false;
        connectionUsername = '';
        res.render("index", {
          showData: false,
          showAlert: true,
          alertState: "success",
          alertMessage: "Database collection dropped successfully."
        });
      }
    });
  } else {
    // If the user is not opening Database
    // Render and alert him to open a database
    res.render("index", {
      showData: false,
      showAlert: true,
      alertState: "danger",
      alertMessage: "Open databse collection first to drop it!"
    });
  }
});

app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000");
});
