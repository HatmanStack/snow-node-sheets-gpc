// Import necessary libraries/modules
const path = require('path');
const {google} = require('googleapis');
const sheets = google.sheets('v4');
const express = require('express');
const fetch = require('node-fetch');

// Create an instance of the Express application
const app = express();

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'https://xki0e95t5c.execute-api.us-east-1.amazonaws.com/prod/submit';

// Define an asynchronous function called getInvite that will fetch data from a Google Sheet and insert it into a DynamoDB table via API Gateway
const getInvite = async () => {
  try {
    // Create a new Google authentication object and specify the location of the credentials file and the scopes to be used
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, 'creds.json'),
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
    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found.');
      return { success: false, error: 'No data found in sheet' };
    }

    // Map the first row of data to the expected JSON structure
    const data = rows[0];
    const item = {
      TS: String(data[0]),
      NAME: String(data[1]),
      DAYS: String(data[2]),
      DIET: String(data[3]),
      PAY: String(data[4])
    };

    console.log(`[DEBUG] Calling API Gateway URL: ${API_GATEWAY_URL}`);
    console.log(`[DEBUG] Item payload: ${JSON.stringify(item)}`);
    const response = await fetch(API_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(item)
    });

    if (response.ok) {
      const successData = await response.json();
      console.log(`[SUCCESS] API Response: ${JSON.stringify(successData)}`);
      return { success: true, item };
    } else {
      const errorText = await response.text();
      console.error(`[API ERROR] Status: ${response.status}, Body: ${errorText}`);
      return { success: false, error: errorText };
    }
  } catch (err) {
    console.error(`[CRITICAL ERROR] ${err.message}`);
    return { success: false, error: err.message };
  }
};
 
// Create Server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Route requests and send response
app.get('/', async (req,res) => {
    console.log('GET / request received');
    const result = await getInvite();
    if (result && result.success) {
        res.send(`Successfully added data for ${result.item.NAME}`);
    } else {
        res.status(500).send(`Failed to add data: ${result ? result.error : 'Unknown error'}`);
    }
});

// Proxy route to fetch data from API Gateway (avoids CORS issues)
app.get('/data', async (req, res) => {
    try {
        const response = await fetch('https://xki0e95t5c.execute-api.us-east-1.amazonaws.com/prod/submit/list');
        const data = await response.json();
        // Ensure data is an array
        if (!Array.isArray(data)) {
            console.error('API Gateway returned non-array data:', data);
            return res.json([]);
        }
        res.json(data);
    } catch (err) {
        console.error('Error fetching data for dashboard:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Simple dashboard
app.get('/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>DynamoDB Dashboard</title>
            <style>
                body { font-family: sans-serif; margin: 40px; background: #f4f4f9; }
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #007bff; color: white; }
                tr:hover { background-color: #f1f1f1; }
                h2 { color: #333; }
            </style>
        </head>
        <body>
            <h2>Form Submissions (DynamoDB)</h2>
            <div id="loading">Loading data...</div>
            <table id="data-table" style="display:none;">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Name</th>
                        <th>Days</th>
                        <th>Diet</th>
                        <th>Pay</th>
                    </tr>
                </thead>
                <tbody id="table-body"></tbody>
            </table>

            <script>
                async function loadData() {
                    try {
                        const response = await fetch('/data');
                        const data = await response.json();
                        
                        // Sort by TS (timestamp) descending
                        data.sort((a, b) => new Date(b.TS) - new Date(a.TS));

                        const tbody = document.getElementById('table-body');
                        data.forEach(item => {
                            const row = \`<tr>
                                <td>\${item.TS}</td>
                                <td>\${item.NAME}</td>
                                <td>\${item.DAYS}</td>
                                <td>\${item.DIET}</td>
                                <td>\${item.PAY}</td>
                            </tr>\`;
                            tbody.innerHTML += row;
                        });
                        document.getElementById('loading').style.display = 'none';
                        document.getElementById('data-table').style.display = 'table';
                    } catch (err) {
                        document.getElementById('loading').innerText = 'Error loading data: ' + err.message;
                    }
                }
                loadData();
            </script>
        </body>
        </html>
    `);
});



