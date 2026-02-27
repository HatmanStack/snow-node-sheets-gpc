# Connecting Google Forms to a DynamoDB Table (The SDK-Free Way)

Every major cloud provider has great in-house tools to make survey results accessible inside their systems. To break out of that system takes a little work. We’ll use Google Forms, Apps Script, Google Cloud Run, and a secure AWS API Gateway bridge to **make it happen**.

![Connect Google Forms with DynamoDB](/blog/connect-google-forms-with-dynamo-1.webp)

<img src="/blog/connect-google-forms-with-dynamo-2.gif" width="300" height="300" alt="Connect Google Forms with DynamoDB">

## 1. Google Form & Apps Script
Make a **Google Form** and head to the **Responses** tab. Click the google sheets icon to create a new spreadsheet. Head over to the new sheet -> Extensions -> Apps Script. You want to create a script that runs every time there is an entry to the form.

```javascript
function myFunction() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var range = sheet.getRange("A2:E2"); // Grab the latest row

  var url = "YOUR_CLOUD_RUN_URL"; 
  var response = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}
```

**CRITICAL STEP:** Click the **Triggers** (alarm clock icon) on the left sidebar and add a trigger for `myFunction` set to **Event type: On form submit**. This makes the magic happen automatically!

## 2. Google Cloud Setup
Next head over to Google Cloud. Navigate to **IAM & Admin -> Service Accounts -> create service account**. We need the email that was created for us, save that for later. 

<img src="/blog/connect-google-forms-with-dynamo-3.gif" width="350" height="200" alt="Connect Google Forms with DynamoDB">

Go to your Service Account -> Keys tab -> Add Key -> JSON. This downloads `creds.json`. **Don't forget:** Share your Google Sheet with that service account email so the Node app has permission to read it!

## 3. The AWS "No-Code" Bridge
We’re moving away from heavy database connectors. Instead of hardcoding AWS Admin keys into our app, we use **API Gateway** as a secure, public-facing proxy for DynamoDB.

Create a DynamoDB table named `dynamo_sheets` (Partition Key: `TS`). Then, set up an API Gateway with a `POST` method that uses a direct **AWS Service Integration** to map your JSON data straight into DynamoDB. 

<img src="/blog/connect-google-forms-with-dynamo-4.gif" width="400" height="250" alt="Connect Google Forms with DynamoDB">

## 4. The Node.js Connector
Our Node app is now ultra-lightweight because it doesn't even need the AWS SDK! It just uses `node-fetch` to talk to our API Gateway.

### index.js
```javascript
const express = require('express');
const fetch = require('node-fetch');
const {google} = require('googleapis');
const app = express();

const getInvite = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: 'creds.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({version: 'v4', auth});
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: 'YOUR_SHEET_ID',
    range: 'A2:E2',
  });
  
  const data = res.data.values[0];
  const item = { TS: data[0], NAME: data[1], DAYS: data[2], DIET: data[3], PAY: data[4] };

  // POST directly to our secure API Gateway bridge
  await fetch("YOUR_API_GATEWAY_URL", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
};

app.get('/', async (req,res) => {
    await getInvite();
    res.send('Data Pushed to DynamoDB!');
});

// We even added a built-in dashboard!
app.get('/dashboard', (req, res) => {
    // Serves a clean HTML table of your DynamoDB data
});
```

## 5. Deployment
The easiest way to deploy is from source using Cloud Shell. Make sure your `creds.json` is in the directory and run:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/myimage .
gcloud run deploy --image gcr.io/YOUR_PROJECT_ID/myimage --platform managed
```

<img src="/blog/connect-google-forms-with-dynamo-5.gif" width="400" height="250" alt="Connect Google Forms with DynamoDB">

## Why this is a Level Up:
1. **Zero AWS SDK**: No massive libraries slowing down your cold starts.
2. **Security First**: Your Cloud Run instance never sees your AWS credentials.
3. **Live Dashboard**: Check `/dashboard` on your Cloud Run URL to see your data landing in real-time!

<img src="/blog/connect-google-forms-with-dynamo-6.gif" width="400" height="250" alt="Connect Google Forms with DynamoDB">

I have noticed a slight lag when entering form data from a cold start but within ~1–2 minutes all the data shows up in DynamoDB. Happy hacking!
