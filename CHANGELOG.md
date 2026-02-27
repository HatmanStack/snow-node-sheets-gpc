# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-02-27

### Added
- **AWS DynamoDB Integration**: Replaced Snowflake with DynamoDB for data storage.
- **AWS API Gateway Bridge**: Introduced a serverless API Gateway bridge to handle secure DynamoDB writes without requiring AWS SDK in the Node.js app.
- **Real-time Dashboard**: Added a `/dashboard` route to the Node.js application to visualize DynamoDB entries.
- **Auto-Sorting**: Dashboard now automatically sorts entries by timestamp (descending).
- **Enhanced Logging**: Added detailed debug logging for API Gateway calls and error handling.
- **Apache 2.0 License**: Added official licensing.

### Changed
- **Architecture**: Moved from a direct database connector to an SDK-free, API-driven architecture.
- **Dependencies**: Removed `snowflake-sdk` and `aws-sdk`, replaced with lightweight `node-fetch`.
- **Infrastructure**: Updated table name to `dynamo_sheets`.

### Fixed
- Resolved `ENOENT` error for `creds.json` by explicitly including it in the Docker build.
- Fixed `ReferenceError: fetch is not defined` by adding `node-fetch` for Node.js 16 compatibility.
- Resolved API Gateway output mapping errors.

## [2.0.0] - Pre-Migration
- Original Snowflake-based implementation.
