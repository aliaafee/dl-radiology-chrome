class DownloadWorker {
    constructor() {
        this.downloadId = null;
        this.downloadStarting = false;

        this.url = "";
        this.filename = "";
        this.isLastDownload = false;

        this.downloadIdToOpen = null;
    }

    startDownload(url, filename, conflictAction, isLastDownload = false) {
        this.downloadStarting = true;
        this.url = url;
        this.filename = filename;
        this.isLastDownload = isLastDownload;

        console.log(url);

        chrome.downloads.download(
            {
                url: url,
                filename: filename,
                conflictAction: conflictAction,
                saveAs: false
            },
            (id) => {
                this.downloadStarting = false;
                this.downloadId = id;
            }
        );
    }

    async getStatus() {
        if (this.downloadStarting === true) {
            return "starting";
        }
        if (this.downloadId === null) {
            return "not_started";
        }
        try {
            const [thisDownload] = await chrome.downloads.search({ id: this.downloadId });
            return thisDownload.state;
        } catch (error) {
            return "not_found";
        }
    }

    show() {
        if (this.isLastDownload) {
            chrome.downloads.show(this.downloadIdToOpen);
            chrome.downloads.erase({ id: this.downloadIdToOpen });
            this.isLastDownload = false;
            this.downloadIdToOpen = null;
        }
    }

    cancel() {
        if (this.downloadId !== null) {
            chrome.downloads.erase({ id: this.downloadId });
            chrome.downloads.cancel(this.downloadId, () => {
                this.downloadId = null;
            })
        }
        if (this.downloadIdToOpen !== null) {
            chrome.downloads.erase({ id: this.downloadIdToOpen });
            chrome.downloads.cancel(this.downloadIdToOpen, () => {
                this.downloadIdToOpen = null;
            })
        }
    }

    async poll() {
        const status = await this.getStatus();

        if (status === "complete") {
            if (!this.isLastDownload) {
                chrome.downloads.erase({ id: this.downloadId });
            } else {
                this.downloadIdToOpen = this.downloadId;
            }
            this.downloadId = null;
            this.downloadStarting = false;
            return "complete";
        }

        if (status === "interrupted") {
            if (!this.isLastDownload) {
                chrome.downloads.erase({ id: this.downloadId });
            } else {
                this.downloadIdToOpen = this.downloadId;
            }
            this.downloadId = null;
            this.downloadStarting = false;
            return "interrupted";
        }

        return status;
    }
}

class Downloader {
    constructor() {
        this.fileList = [];

        this.workers = [];
        const workerCount = 10;
        for (let i = 0; i < workerCount; i++) {
            this.workers.push(new DownloadWorker())
        }

        this.totalCount = this.fileList.length;

        this.interrupted = [];
        this.complete = [];

        this.status = "not_started";
    }

    startDownload(fileList) {
        this.fileList = fileList;
        this.totalCount = this.fileList.length;

        chrome.downloads.setUiOptions({
            enabled: false
        });

        this.status = "in_progress";

        this.poll();
    }

    getCompletedPercentage() {
        if (this.totalCount == 0) {
            return 0;
        }
        return Math.round(((this.getCompletedCount()) * 100) / this.totalCount);
    }

    getCompletedCount() {
        return this.complete.length + this.interrupted.length;
    }

    getFailedCount() {
        return this.interrupted.length;
    }

    getTotalCount() {
        return this.totalCount;
    }

    getStatus() {
        if (this.getTotalCount() < 1) {
            return "not_started";
        }
        return this.status;
    }

    show() {
        this.workers.forEach((worker) => {
            worker.show();
        })
    }

    cancel() {
        this.workers.forEach((worker) => {
            worker.cancel();
        })
    }

    async poll() {
        this.workers.forEach(async (worker) => {
            const status = await worker.poll();
            if (status === "in_progress" || status === "starting") {
                return;
            }
            if (status === "complete") {
                this.complete.push({
                    url: worker.url,
                    filename: worker.filename
                })
            }
            if (status === "interrupted") {
                this.interrupted.push({
                    url: worker.url,
                    filename: worker.filename
                })
            }
            if (status === "complete" ||
                status === "interrupted" ||
                status === "not_started" ||
                status === "not_found") {

                if (this.fileList.length < 1) {
                    return;
                }

                const nextDownload = this.fileList.pop();

                if (this.fileList.length < 1) {
                    worker.startDownload(
                        nextDownload.url,
                        nextDownload.filename,
                        'overwrite',
                        true
                    )
                    return
                }

                worker.startDownload(
                    nextDownload.url,
                    nextDownload.filename,
                    'overwrite'
                )
            }
        })

        if (this.fileList.length < 1) {
            if (this.getCompletedCount() == this.getTotalCount()) {
                this.status = "complete";
                return;
            }
        }

        setTimeout(() => {
            this.poll()
        }, 100);
    }

}

const downloader = new Downloader();
var downloadStatus = "starting";

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.action === "downloadStudyWindow") {
            downloadStudy(request.studyUrl);
        }
    }
)

document.addEventListener("DOMContentLoaded", function () {
    monitor();

    const cancelButton = document.getElementById("cancel-button");
    cancelButton.onclick = () => {
        downloader.cancel();
        window.close();
    }
});

async function downloadStudy(studyUrl) {
    const statusElem = document.getElementById("status");
    const headerElem = document.getElementById("header");

    try {
        const fileTree = await getFileTree(studyUrl);

        console.log(fileTree);

        if (fileTree === null) {
            console.log("No files found");
            downloadStatus = "failed";
            return;
        }

        const fileList = flattenFileTree(fileTree);

        const patientName = getDicomPatientName(fileTree);

        headerElem.innerText = `Downloading study of ${patientName}`;

        downloader.startDownload(fileList);
    } catch (error) {
        console.log("Failed to download");
        downloadStatus = "failed";
        return;
    }
}

function getDicomStudyInstanceId(fileTree) {
    return fileTree['studies'][0]['StudyInstanceUID'];
}

function getDicomPatientName(fileTree) {
    return fileTree['studies'][0]['PatientName'];
}

function getDownloadFileName(patientName, studyId, url) {
    const parts = url.split("file=");
    const fileName = parts[1].replace(/\//g, "");

    return `${patientName}-${studyId}/${fileName}.dcm`;
}

async function getFileTree(studyUrl) {
    try {
        const response = await fetch(studyUrl)
        if (!response.ok) {
            console.log("Could not get file tree");
            return null;
        }

        const fileTree = await response.json();

        return fileTree;
    } catch (error) {
        return null;
    }
}

function flattenFileTree(fileTree) {
    const studyId = getDicomStudyInstanceId(fileTree);
    const patientName = getDicomPatientName(fileTree);

    const fileList = [];

    fileTree.studies.forEach((study) => {
        study.series.forEach((series) => {
            const instanceUrls = series.instances.map((instance) => {
                const url = instance.url.replace("dicomweb:", "");
                const downloadFilename = getDownloadFileName(patientName, studyId, url);
                return {
                    "url": url,
                    "filename": downloadFilename
                }
            })
            fileList.push(...instanceUrls);
        })
    })

    return fileList;
}

async function monitor() {
    const progressElement = document.getElementById("progress-completed");
    const statusElem = document.getElementById("status");

    progressElement.style.width = downloader.getCompletedPercentage() + "%";

    if (downloadStatus === "failed") {
        statusElem.innerText = "Download failed"
        return;
    }

    if (downloader.getStatus() === "complete") {
        statusElem.innerText = `Downloads complete, ${downloader.getCompletedCount() - downloader.getFailedCount()} of ${downloader.getTotalCount()} files downloaded`;
        if (downloader.getFailedCount() > 0) {
            const errorElem = document.getElementById("error");
            errorElem.innerText = `failed to download ${downloader.getFailedCount()} files`;
        }
        const openButton = document.getElementById("open-button");
        openButton.removeAttribute("disabled");
        openButton.onclick = () => {
            downloader.show();
            window.close();
        }
        const cancelButton = document.getElementById("cancel-button");
        cancelButton.innerText = "Close";
        return;
    }

    if (downloader.getTotalCount() < 1) {
        statusElem.innerText = "Starting..."
    } else {
        statusElem.innerText = `${downloader.getCompletedCount() - downloader.getFailedCount()} of ${downloader.getTotalCount()} files downloaded`;
        if (downloader.getFailedCount() > 0) {
            const errorElem = document.getElementById("error");
            errorElem.innerText = `failed to download ${downloader.getFailedCount()} files`;
        }
    }

    setTimeout(() => {
        monitor();
    }, 100)
}