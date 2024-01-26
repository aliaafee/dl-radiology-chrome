
var downloadUrlToWindows = {};
var windowsToDownloadUrls = {};

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.action === "downloadStudy") {
            downloadStudy(request.studyUrl);
        }
    }
);

chrome.windows.onRemoved.addListener(
    function (windowId) {
        if (windowId in windowsToDownloadUrls) {
            delete downloadUrlToWindows[windowsToDownloadUrls[windowId]];
            delete windowsToDownloadUrls[windowId];
        }
        console.log(Object.keys(windowsToDownloadUrls));
        if (Object.keys(windowsToDownloadUrls).length < 1) {
            chrome.downloads.setUiOptions({
                enabled: true
            });
        }
    }
)

async function downloadStudy(studyUrl) {
    console.log("Download study " + studyUrl);

    if (studyUrl in downloadUrlToWindows) {
        const windowId = downloadUrlToWindows[studyUrl];
        var updateProperties = { 'focused': true, "drawAttention": true };
        chrome.windows.update(windowId, updateProperties, () => { });

        return;
    }

    chrome.windows.create({
        url: chrome.runtime.getURL("downloader.html"),
        width: 400,
        height: 170,
        type: "popup"
    }, (window) => {
        console.log(window);
        downloadUrlToWindows[studyUrl] = window.id;
        windowsToDownloadUrls[window.id] = studyUrl;
        startDownloading(window.tabs[0].id, studyUrl);
    });
}


async function startDownloading(tabid, studyUrl) {
    // Repeatedly checks to see if the tab is loaded and
    // then send the message
    const tab = await chrome.tabs.get(tabid);

    if (tab.status === "complete") {
        chrome.tabs.sendMessage(tabid, { "action": "downloadStudyWindow", "studyUrl": studyUrl })
        return;
    }

    setTimeout(async () => {
        await startDownloading(tabid, studyUrl)
    }, 100)
}
