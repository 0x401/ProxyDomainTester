# Proxy Domain Tester

[中文文档](README_CN.md)

This is a Chrome browser extension designed to help developers and network administrators test the connectivity and loading performance of third-party domains relied upon by the current web page (such as CDNs, APIs, tracking codes, etc.) under specific proxy strategies.

## Features

After starting the test, the extension opens the current page in a new background tab and initiates network requests using the strategy: "Access the current page's domain via proxy, and access other domains on the page via direct connection." After a certain period, it collects request data and closes the background tab.

As shown in the result below, when visiting the `https://www.google.com` page, the `www.gstatic.com` domain can be accessed normally via direct connection.

![Preview](preview.png)

## Installation

Since this extension has not been published to the Chrome Web Store, you need to install it via "Load unpacked":

1. **Download Code**: Clone or download this repository to your local machine.
2. **Open Extensions Page**: Type `chrome://extensions/` in the Chrome address bar and press Enter.
3. **Enable Developer Mode**: Click the "Developer mode" toggle in the top right corner.
4. **Load Extension**: Click the "Load unpacked" button in the top left corner and select the root directory of this project.
5. **Done**: The extension icon will appear in the browser toolbar, indicating successful installation.

## Usage

### 1. Configure Proxy (Required for First Use)
Before starting the test, you need to tell the extension which proxy server to use for accessing the main page:
- **Right-click** on the extension icon and select **"Options"**.
- Enter your proxy server address in the **"Proxy Address"** field (e.g., `127.0.0.1:7890`).
- Adjust parameters like timeout as needed; settings are saved automatically.

### 2. Start Test
1. Open the target webpage you want to test in your browser.
2. Click the extension icon to open the Popup panel.
3. Click the **Start Test** button.
4. Wait for the test to complete.

### 3. Stop Test
Click the **Stop Test** button at any time during the test to abort. Acquired results will be preserved.

## Settings

Go to the **Options** page for detailed configuration:

- **Proxy Address**:
    - Required. Format: `IP:Port` or `Domain:Port`.
- **Request Timeout**:
    - The maximum waiting time for page loading (default recommended: 5000ms).
- **Test Collection Duration**:
    - The time window to continue collecting subsequent resource requests after the page load completes.
- **Disable Cache**:
    - If checked, attempts to disable cache for test requests.

## Notes
- During testing, the browser's proxy settings will be temporarily taken over. After the test ends, it will automatically restore to default settings.
- Due to the complexity of page loading, the number of domains collected may be less than those directly viewable in the developer tools.
