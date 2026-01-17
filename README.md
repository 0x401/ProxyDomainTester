# Proxy Domain Tester

This is a Chrome browser extension designed to help developers and network administrators test the connectivity and loading performance of third-party domains relied upon by the current web page under specific proxy strategies.

By simulating real page loading processes, this extension can accurately analyze which associated domains (such as CDNs, APIs, tracking codes, etc.) are accessible in Direct mode, which ones require a proxy, and their loading duration.

## ✨ Key Features

- **In-Depth Direct Mode Testing**
    - **Smart PAC Strategy**: Automatically generates a PAC script during testing that routes only the current page's main domain (Host) through the user-configured proxy server, while forcing all other associated domains to go Direct.
    - **Real Environment Simulation**: This simulates a scenario where "the main site uses a proxy, while resources go direct," helping to detect the direct availability of resources.

- **Background Silent Testing**
    - The testing process runs in a background tab that is not activated, created via `chrome.tabs.create`. It automatically closes upon completion, ensuring it does not interfere with the user's current browsing experience.

- **Precise Performance Monitoring**
    - Utilizes the browser's native `Performance API` to obtain accurate resource loading durations.
    - Supports custom timeouts and collection windows to ensure data integrity.

- **Modern User Interface**
    - Clear and intuitive Popup panel displaying real-time test status (success/failure) and duration for each domain.
    - Provides a detailed configuration options page.

## 🚀 Installation Guide

Since this extension has not been published to the Chrome Web Store, you need to install it via "Load unpacked":

1. **Download Code**: Clone or download this repository to your local machine.
2. **Open Extensions Page**: Type `chrome://extensions/` in the Chrome address bar and press Enter.
3. **Enable Developer Mode**: Click the "Developer mode" toggle in the top right corner.
4. **Load Extension**: Click the "Load unpacked" button in the top left corner and select the root directory of this project.
5. **Done**: The extension icon will appear in the browser toolbar, indicating successful installation.

## 📖 Usage Instructions

### 1. Configure Proxy (Required for First Use)
Before starting the test, you need to tell the extension which proxy server to use for accessing the main page:
- **Right-click** on the extension icon and select **"Options"**.
- Enter your proxy server address in the **"Proxy Address"** field (e.g., `127.0.0.1:7890`).
- Adjust parameters like timeout as needed; settings are saved automatically.

### 2. Start Test
1. Open the target webpage you want to test in your browser.
2. Click the extension icon to open the Popup panel.
3. Click the **"Start Test"** button at the bottom.
4. The extension will automatically analyze the domains involved and start testing in the background.
5. The panel list will display the test results for each domain in real-time:
    - **Domain**: The domain of the resource (clickable).
    - **Status**: Displays loading duration (e.g., `120ms`) or error information.
    - **Speed**: Displays the connection speed (e.g., `120KB/s`).

### 3. Stop Test
Click the **"Stop Test"** button at any time during the test to abort. Acquired results will be preserved.

## ⚙️ Configuration Options

Go to the **Options** page for detailed configuration:

- **Proxy Address**:
    - Required. Format: `IP:Port` or `Domain:Port`.
    - Function: During testing, only the main domain of the current page will be accessed via this proxy.
- **Request Timeout (ms)**:
    - The maximum waiting time for page loading (default recommended: 5000ms).
- **Test Collection Duration (ms)**:
    - The time window to continue collecting subsequent resource requests after the page load completes.
- **Disable Cache for Test Requests**:
    - If checked, test requests will disable browser cache, resulting in more accurate but potentially slower results.

## 🛠️ Tech Stack

- **Manifest V3**: Uses the latest Chrome Extension standard.
- **Native APIs**:
    - `chrome.proxy` & `chrome.declarativeNetRequest`: Control network proxies.
    - `chrome.webRequest` & `chrome.webNavigation`: Monitor network request status.
    - `chrome.tabs`: Manage background test tabs.
    - `Performance API`: Obtain high-precision timing data.
- **UI**: Native HTML/CSS/JS, no third-party framework dependencies, lightweight and efficient.

## ⚠️ Notes

- During testing, the browser's global proxy settings will be temporarily taken over. After the test ends or stops, it will automatically restore to the system default settings (System).
- Due to the complexity of page loading, the number of domains collected may be less than those directly viewable in the developer tools.
