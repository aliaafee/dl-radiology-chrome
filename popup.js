const fileServerUrl = "http://127.0.0.1:5000";
// const fileServerUrl = "http://10.10.10.197:4000";
const viewerUrl = "http://10.10.10.91:3000";

const spinner = '<div class="spinner"><span></span></span>';

document.addEventListener("DOMContentLoaded", function () {
	onPopupLoaded();
});

async function getActiveTab() {
	let queryOptions = { active: true, currentWindow: true };
	let [tab] = await chrome.tabs.query(queryOptions);
	return tab;
}

async function onPopupLoaded() {
	const contentElem = document.getElementById("content");
	contentElem.innerHTML = `<div class="status">${spinner}</div>`;

	const activeTab = await getActiveTab();
	const studies = await chrome.tabs.sendMessage(
		activeTab.id,
		{ "action": "getStudies", "arguments": "" }
	);

	displayStudyList(studies);
}

async function downloadStudy(studyUrl) {
	chrome.runtime.sendMessage({ "action": "downloadStudy", "studyUrl": studyUrl });
}

function getStudyUrl(studyItem) {
	const studyDate = new Date(studyItem.studyDate);

	return `${fileServerUrl}/zfpviewer/api/download?file=/zfp/${studyDate.getFullYear()}/${studyDate.getMonth() + 1}/${studyDate.getDate()}/${studyItem.studyUid}.json`;
}

function createListItem(studyItem) {
	const studyUrl = getStudyUrl(studyItem);

	console.log(studyItem.serviceName, studyUrl);

	if (!studyUrl) {
		return
	}

	var studyItemElement = document.createElement("li");
	studyItemElement.setAttribute("id", studyItem.studyUid);
	studyItemElement.className = "study-item";

	const studyHeader = document.createElement("div");
	studyHeader.className = "study-header";
	studyItemElement.appendChild(studyHeader);

	const studyDescription = document.createElement("a");
	studyDescription.className = "study-description"
	studyDescription.innerHTML = `<span><div class="expand-arrow"></div></span> <span>${studyItem.studyDate}</span> <span>${studyItem.serviceName}</span>`;
	studyHeader.appendChild(studyDescription);

	const studyView = document.createElement("a");
	studyView.className = "study-view-link";
	studyView.innerHTML = "&#10697;";//"&#128065;";
	studyView.title = "View Study";
	studyHeader.appendChild(studyView);

	const studyDownloadExternal = document.createElement("a");
	studyDownloadExternal.className = "study-download-external-link";
	studyDownloadExternal.innerHTML = "&#10515;";
	studyDownloadExternal.title = "Download With External Downloader";
	studyHeader.appendChild(studyDownloadExternal);

	const studyDownloadAllInternal = document.createElement("a");
	studyDownloadAllInternal.className = "study-download-internal-link";
	studyDownloadAllInternal.innerHTML = "&#10515;";
	studyDownloadAllInternal.title = "Download Study";
	studyHeader.appendChild(studyDownloadAllInternal);

	if (studyUrl) {
		studyDescription.onclick = () => {
			showStudyDetails(studyItem.studyUid, studyUrl);
		}

		studyView.setAttribute("target", "_blank");
		studyView.setAttribute("href", `${viewerUrl}/viewer?url=${studyUrl}`);

		studyDownloadExternal.setAttribute("href", `dldicom:${studyUrl}`);

		studyDownloadAllInternal.onclick = () => {
			downloadStudy(studyUrl);
		}
	}

	return studyItemElement;
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

async function showStudyDetails(studyUid, studyUrl) {
	const studyElement = document.getElementById(studyUid);

	let studyDetailsElement = document.getElementById(`${studyUid}_details`);

	if (studyDetailsElement !== null) {
		if (studyElement.classList.contains("details-visible")) {
			studyElement.classList.remove("details-visible");
			return;
		}
		studyElement.classList.add("details-visible");
		return;
	}

	studyDetailsElement = document.createElement("div");
	studyDetailsElement.setAttribute("id", `${studyUid}_details`);
	studyDetailsElement.classList = "study-details";

	studyElement.classList.add("details-visible");

	studyElement.append(studyDetailsElement);

	studyDetailsElement.innerHTML = `<ul><li>${spinner}</li><ul>`;

	const fileTree = await getFileTree(studyUrl);

	if (fileTree === null) {
		studyDetailsElement.innerHTML = "<ul><li><span>Not Found</span></li><ul>";
		return
	}

	if (Object.keys(fileTree).length < 1) {
		studyDetailsElement.innerHTML = "<ul><li><span>Not Series</span></li><ul>";
		return;
	}

	studyDetailsElement.innerHTML = "";

	const studiesListItems = createStudiesListItems(fileTree);

	studyDetailsElement.append(...studiesListItems)
}

function createStudiesListItems(fileTree) {
	const studyId = getDicomStudyInstanceId(fileTree);
	const patientName = getDicomPatientName(fileTree);

	return fileTree.studies.map((study) => {
		const studyItem = document.createElement("li");
		studyItem.innerText = study.StudyDescription;

		const seriesListItems = study.series.map((series) => {
			const seriesItem = document.createElement("li");
			seriesItem.className = "series-item"

			const descriptionElement = document.createElement("span");
			descriptionElement.innerText = series.SeriesDescription;
			seriesItem.append(descriptionElement);

			const instanceUrls = series.instances.map((instance) => {
				const url = instance.url.replace("dicomweb:", "");
				const downloadFilename = getDownloadFileName(patientName, studyId, url);
				return {
					"url": url,
					"filename": downloadFilename
				}
			})

			const countElemenet = document.createElement("span")
			countElemenet.innerText = ` (${instanceUrls.length} files) `;
			seriesItem.append(countElemenet)

			return seriesItem
		})
		const seriesList = document.createElement("ul");
		seriesList.append(...seriesListItems);
		studyItem.append(seriesList);

		return seriesList;
	})
}

function displayStudyList(studies) {
	const contentElem = document.getElementById("content");

	if (studies.length === 0) {
		contentElem.innerHTML = '<div class="status">No studies found</div>';
		return;
	}

	contentElem.innerHTML = "";

	const studiesList = document.createElement("ul");
	studiesList.className = "studies-list"
	contentElem.appendChild(studiesList);

	studies.forEach((studyItem) => {
		console.log(studyItem);
		var e = createListItem(studyItem);
		if (e) {
			studiesList.appendChild(e);
		}
	});
}

console.log(chrome.downloads)