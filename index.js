// Import necessary libraries/modules
const path = require('path');
const {google} = require('googleapis');
const sheets = google.sheets('v4');
const snow = require('snowflake-sdk');
const express = require('express');
const { osconfig } = require('googleapis/build/src/apis/osconfig');

// Create an instance of the Express application
const app = express();

// Define an asynchronous function called getInvite that will fetch data from a Google Sheet and insert it into a Snowflake database
const getInvite = async () => {
  // Create a new Google authentication object and specify the location of the credentials file and the scopes to be used
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'secrets/creds.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // Use the authentication object for all Google API requests
  google.options({auth});

  // Fetch data from a specific range in a Google Sheet
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '1bZ7vNXLzV39VltQc74chsOHfjgNvdBQfYLc_wirN1WU',
    range: 'A2:E2',
  });

  // Check if any data was returned from the Google Sheet and log it to the console
  const row = res.data.values;
  if (!row || row.length === 0) {
    console.log('No data found.');
    return;
  } else {
    console.log(row)
  }

  // Create a new Snowflake connection object and specify the account, username, password, warehouse, database, schema, and role to be used
  const connection = snow.createConnection(
    {
      account: process.env.REGION,
      username: process.env.USERNAME,
      password: process.env.PASSWORD,
      warehouse: 'COMPUTE_WH',
      database: 'DEMO_DB',
      schema: 'PUBLIC',
      role: 'ACCOUNTADMIN'
    }
  );

  // Log the Snowflake connection object to the console
  console.log(connection)

  // Connect to the Snowflake database and execute a parameterized query to insert the fetched data into a specific table
  const conn = connection.connect();
  conn.execute({sqlText: 'INSERT INTO DEMO_DB.PUBLIC.SHEETS(TS, NAME, DAYS, DIET, PAY) values(?, ?, ?, ?, ?)', binds: row,
    complete: function(err, stmt, rows) {
      if (err) {
        console.log(`Failed to execute statement due to the following error: ${err.message}`);
    }  }});
  }
 
// Create Server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log('listening');
});

// Route requests and send response
app.get('/', (req,res) => {
    getInvite();
    res.send('Adding Data');
});



