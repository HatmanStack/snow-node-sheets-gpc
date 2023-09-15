# Connecting Google Forms to a Snowflake Database

This guide will show you how to connect Google Forms to a Snowflake Database through Node Express hosted on Google Cloud Run.

## Post With Granular Instructions

[Medium Post](https://medium.com/@HatmanStack/connect-google-forms-with-snowflake-ac8a2a6837b)

## Prerequisites

Before getting started, you will need the following:

- Google Forms Account
- Google Cloud Account
- Snowflake Account
- Node

## Setup

- Google Form 
- Snowflake Database with Schema `DEMO_DB.PUBLIC.SHEETS`
- Create GPC Service Account Credentials, folder `secrets`, insert credentials into folder and rename `creds.json`
- Replace `REGION`, `USERNAME`, `PASSWORD` with your own Snowflake credentials
- Deploy to Google Cloud Run.
- Configure Node app to connect Google Form and Snowflake Database. [Medium Post](https://medium.com/@HatmanStack/connect-google-forms-with-snowflake-ac8a2a6837b)

## Continuous Deployment

The service is built and deployed automatically using Google Cloud Build, configured in cloudbuild.yaml. Cloud Build pulls the latest code, builds the Docker container, and pushes it to Google Container Registry.

The container image is then deployed to Cloud Run using a rolling update. These builds are triggered on every code commit to the main branch, enabling continuous deployment. Additional Cloud Build triggers can be configured to rebuild on other branches or schedule recurring builds.

## License

This project is Licensed under the MIT License.

