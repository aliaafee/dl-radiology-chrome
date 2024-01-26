chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.action === "getStudies") {
            (async () => {
                const patientId = getPatientId();
                console.log(patientId);
                if (patientId === null) {
                    sendResponse([]);
                    return;
                }
                const studiesUrl = getStudiesUrl(patientId);
                console.log(studiesUrl);
                const studies = await getStudyList(studiesUrl);
                sendResponse(studies);
            })();
            return true;
        }
    }
);

function getPatientId() {
    const idElement = document.getElementById("currentPatientId");
    if (idElement === null) {
        return null;
    }
    return idElement.value;
}

function getStudiesUrl(patientId) {
    const documentUrl = new URL(window.location.href);

    return `${documentUrl.origin}/df/pcc/widgets/radiologyServices/${patientId}/100`;
}

async function getStudyList(url) {
    try {
        const response = await fetch(url)
        if (!response.ok) {
            return [];
        }

        const content = await response.json();

        return content
    } catch (error) {
        console.error(error);
        return [];
    }
}