# Connecting Google Forms to DynamoDB via API Gateway

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Cloud_Run-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google_Sheets-34A853?style=for-the-badge&logo=googlesheets&logoColor=white)
![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-4285F4?style=for-the-badge&logo=google-apps-script&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)
![AWS API Gateway](https://img.shields.io/badge/AWS_API_Gateway-FF9900?style=for-the-badge&logo=amazon-api-gateway&logoColor=white)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)

This [guide](https://portfolio.hatstack.fun/read/post/Connect-Google-Forms-to-DyanmoDB) shows how to connect Google Forms to DynamoDB using a public API Gateway endpoint and Node.js on Google Cloud Run.

## Architecture

1.  **Google Forms**: User submits data.
2.  **Apps Script**: Triggered on form submit, calls the Cloud Run service.
3.  **Cloud Run (Node.js)**: Fetches the latest row from Google Sheets and POSTs it to API Gateway.
4.  **API Gateway**: Public endpoint that securely maps the request to a DynamoDB `PutItem` action using an internal IAM role.
5.  **DynamoDB**: Final storage in the `dynamo_sheets` table.

## Setup

- Google Form & Sheet setup.
- DynamoDB Table `dynamo_sheets` (Partition Key: `TS`).
- API Gateway configured with DynamoDB integration.
- GCP Service Account `creds.json` in the root directory.
- Configure environment variable (optional):
    - `API_GATEWAY_URL`: Your public API Gateway endpoint.
- Deploy to Google Cloud Run.

## Continuous Deployment

The service is built and deployed automatically using Google Cloud Build, configured in cloudbuild.yaml. Cloud Build pulls the latest code, builds the Docker container, and pushes it to Google Container Registry.

The container image is then deployed to Cloud Run using a rolling update. These builds are triggered on every code commit to the main branch, enabling continuous deployment. Additional Cloud Build triggers can be configured to rebuild on other branches or schedule recurring builds.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of recent changes.

