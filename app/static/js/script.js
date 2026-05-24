// ==========================================================================
//   Global Variables
// ==========================================================================

let allTableData = {};
let isFwaInitialized = false;
let isPubsecIlecInitialized = false;
let fwaFilteredRecordCount = 0;
let pubsecIlecChoicesInstances = [];

let isFrnInitialized = false;
let frnChoicesInstances = [];
let frnCurrentView = 'data_view';
let frnDefaultColumns = {};
let frnAllColumns = {};
let lastAppliedFrnFilters = {};
let frnChartInstance = null;
let frnClickFilter = {};
let frnScatterChartInstance = null;
let frnDefinedWcChoiceInstance = null;

let isRcm2Initialized = false;
let rcm2ChoicesInstances = [];
let rcmInitialData = null;
let rcmPollTimer = null;

let isCheetahInitialized = false;
let cheetahChoicesInstances = [];
let cheetahCurrentView = 'data_view';
let cheetahDefaultColumns = {};
let cheetahAllColumns = {};
let lastAppliedCheetahFilters = {};
let cheetahChartInstance = null;
let cheetahClickFilter = {};

// ==========================================================================
//   UI and Utility Functions
// ==========================================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show';
    if (type === 'error') {
        toast.classList.add('error');
    }
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

function openTool(evt, toolName) {
    const downloadButtons = document.querySelector('.download-buttons')
    if (downloadButtons) {
        downloadButtons.style.display = 'none';
    }
    const allToolContent = document.getElementsByClassName("tool-content");
    for (let i = 0; i < allToolContent.length; i++) {
        allToolContent[i].style.display = "none";
    }

    const allNavTabs = document.getElementsByClassName("nav-tab");
    for (let i = 0; i < allNavTabs.length; i++) {
        allNavTabs[i].className = allNavTabs[i].className.replace(" active", "");
    }

    if (toolName === 'fwaRun' && !isFwaInitialized) {
        initializeFwaTool();
    }
    if (toolName === 'pubsecIlecRun' && !isPubsecIlecInitialized) {
        initializePubsecIlecTool();
    }
    if (toolName === 'frnRun' && !isFrnInitialized) {
        initializeFrnTool();
    }
    if (toolName === 'rcm2Run' && !isRcm2Initialized) {
        initializeRcm2Tool();
    }
    if (toolName === 'cheetahRun' && !isCheetahInitialized) {
        initializeCheetahTool();
    }

    const elementToShow = document.getElementById(toolName);
    if (elementToShow) {
        elementToShow.style.display = "block";
        if (evt) evt.currentTarget.className += " active";
    } else {
        console.error("DEBUG ERROR: Tool named '" + toolName + "' not found in HTML.");
    }
}

function createTableHtml(data, columns) {
    let tableHtml = '<div class="table-wrapper"><table><thead><tr>';
    columns.forEach(column => tableHtml += `<th>${column}</th>`);
    tableHtml += '</tr></thead><tbody>';
    data.forEach(item => {
        tableHtml += '<tr>';
        columns.forEach(column => {
            const cellValue = item[column] !== null && item[column] !== undefined ? item[column] : 'N/A';
            tableHtml += `<td>${cellValue}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
}

// ==========================================================================
//   Third Party Decomm Functions
// ==========================================================================

async function processDecommData() {
    const loading = document.getElementById('loading');
    const processButton = document.getElementById('processButton');
    const processingInfo = document.getElementById('processingInfo');

    document.querySelectorAll('.download-buttons').forEach(el => el.style.display = 'none');
    processingInfo.style.display = 'none';
    loading.style.display = 'block';
    processButton.disabled = true;

    try {
        const response = await fetch('/process', {method: 'POST'});
        const data = await response.json();

        if (data.status === 'success') {
            allTableData = data.data;

            const processingSteps = data.processing_info.map(step => `<li>${step}</li>`).join('');
            document.getElementById('processingContent').innerHTML = `<ul>${processingSteps}</ul>`;
            processingInfo.style.display = 'block';

            for (const key in allTableData) {
                const tableDiv = document.getElementById(key.replace(/_/g, '-') + '-table');
                if (tableDiv) {
                    tableDiv.innerHTML = allTableData[key].html;
                    if (allTableData[key].json && allTableData[key].json.length > 0) {
                        tableDiv.nextElementSibling.style.display = 'flex';
                    }
                }
            }
            document.getElementById('resultsWrapper').style.display = 'block';
            showToast('Data processed successfully!');
        } else {
            showToast(data.message, 'error');
        }
    } catch (error) {
        showToast('Error processing data: ' + error.message, 'error');
    } finally {
        loading.style.display = 'none';
        processButton.disabled = false;
    }
}

// ==========================================================================
//   Pubsec Baseline Functions
// ==========================================================================
async function generatePubsecReport() {
    const loadingDiv = document.getElementById('pubsecLoading');
    const logOutput = document.getElementById('log-output');
    const reportButton = document.getElementById('generateReportBtn');
    const resultsWrapper = document.getElementById('pubsecResultsWrapper');

    loadingDiv.style.display = 'block';
    resultsWrapper.style.display = 'none';
    logOutput.textContent = '';
    reportButton.disabled = true;

    const eventSource = new EventSource('/pubsec-baseline-stream');

    eventSource.onmessage = function (event) {
        logOutput.textContent += event.data + '\n';
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    eventSource.addEventListener('result', function (event) {
        const data = JSON.parse(event.data);
        allTableData['pubsec_baseline'] = data;
        const tableDiv = document.getElementById('pubsec-baseline-table');
        tableDiv.innerHTML = data.html;
        resultsWrapper.style.display = 'block';
        loadingDiv.style.display = 'none';
        showToast('Report generated successfully!');
        eventSource.close();
        reportButton.disabled = false;
    });

    eventSource.addEventListener('error_event', function (event) {
        const errorData = JSON.parse(event.data);
        showToast('Error: ' + errorData.error, 'error');
        console.error("Server-sent error:", errorData.error);
        eventSource.close();
        loadingDiv.style.display = 'none';
        reportButton.disabled = false;
    });

    eventSource.onerror = function (err) {
        showToast('Error: Connection to server was lost.', 'error');
        console.error("EventSource failed:", err);
        eventSource.close();
        loadingDiv.style.display = 'none';
        reportButton.disabled = false;
    };
}

// ==========================================================================
//   Strategic Location Analyzer Functions
// ==========================================================================
async function handleStrategicAnalysis() {
    const stateInput = document.getElementById('state-input');
    const resultsContainer = document.getElementById('results-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');

    const state = stateInput.value.trim().toUpperCase();
    if (state.length !== 2) {
        showStrategicError('Please enter a valid 2-letter state code.');
        return;
    }

    resultsContainer.classList.add('hidden');
    errorMessage.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');

    try {
        const response = await fetch(`http://127.0.0.1:8000/analyze_location/${state}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `An error occurred: ${response.statusText}`);
        }
        const data = await response.json();
        displayStrategicResults(data);
    } catch (error) {
        showStrategicError(error.message);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

function displayStrategicResults(data) {
    const analysisSummaryDiv = document.getElementById('analysis-summary');
    const strategicRecommendationDiv = document.getElementById('strategic-recommendation');
    const resultsContainer = document.getElementById('results-container');

    const summary = data.analysis_summary;
    analysisSummaryDiv.innerHTML = `
        <ul class="space-y-3 text-gray-700">
            <li><strong>State:</strong> ${summary.state}</li>
            <li><strong>Total Premises Analyzed:</strong> ${summary.total_premises.toLocaleString()}</li>
            <li><strong>FTTP Ready Premises:</strong> ${summary.fttp_ready_premises.toLocaleString()} (${summary.fttp_ready_percentage}%)</li>
            <li><strong>FWA Eligible Premises:</strong> ${summary.fwa_migration_eligible_premises.toLocaleString()} (${summary.fwa_migration_percentage}%)</li>
        </ul>
        <h3 class="font-bold mt-6 mb-2 text-lg">Line of Business Distribution:</h3>
        <ul class="list-disc pl-5 space-y-2 text-gray-700">
            ${Object.entries(summary.line_of_business_distribution).map(([lob, count]) => `<li>${lob}: ${count.toLocaleString()}</li>`).join('')}
        </ul>
    `;

    let recommendationHtml = data.strategic_recommendation_ai;
    recommendationHtml = recommendationHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    recommendationHtml = recommendationHtml.replace(/\n/g, '<br>');
    recommendationHtml = recommendationHtml.replace(/- (.*?)(<br>|$)/g, '<ul><li>$1</li></ul>');
    recommendationHtml = recommendationHtml.replace(/<\/ul><ul>/g, '');

    strategicRecommendationDiv.innerHTML = recommendationHtml;
    resultsContainer.classList.remove('hidden');
}

function showStrategicError(message) {
    const errorMessage = document.getElementById('error-message');
    errorMessage.textContent = `Error: ${message}`;
    errorMessage.classList.remove('hidden');
}


// ==========================================================================
//  Pubsec ILEC Viewer Functions
// ==========================================================================
async function initializePubsecIlecTool() {
    isPubsecIlecInitialized = true;
    const loadingDiv = document.getElementById('pubsec-ilec-loading');
    const summaryContainer = document.getElementById('pubsec-ilec-summary-cards');
    const columnListContainer = document.getElementById('pubsec-ilec-column-list');
    const tableContainer = document.getElementById('pubsec-ilec-table-container');
    const controlsDiv = document.getElementById('pubsec-ilec-controls');
    const filtersContainer = document.getElementById('pubsec-ilec-filters-container');

    loadingDiv.style.display = 'block';
    summaryContainer.innerHTML = '';
    columnListContainer.innerHTML = '';
    tableContainer.innerHTML = '';
    filtersContainer.innerHTML = '';
    pubsecIlecChoicesInstances = [];

    try {
        const response = await fetch('/pubsec-ilec');
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const data = await response.json();

        if (data.status === 'success') {
            const stats = data.stats;
            summaryContainer.innerHTML = `
                <div class="stat-card"><h4>TDM Circuits</h4><p>${stats.tdm_circuits}</p></div>
                <div class="stat-card"><h4>DSL Circuits</h4><p>${stats.dsl_circuits}</p></div>
                <div class="stat-card"><h4>Overlapping Circuits</h4><p>${stats.overlap_circuits}</p></div>
            `;

            if (data.filter_options) {
                let filtersHtml = '';
                filtersContainer.classList.add('flex', 'flex-wrap', 'items-start', 'gap-4', 'mb-4');
                for (const column in data.filter_options) {
                    const options = data.filter_options[column];
                    let containerWidthClass = 'flex-1';
                    if (column === 'VZ_NASP_NAME') {
                        containerWidthClass = 'w-1/2';
                        filtersHtml += '<div style="flex-basis: 100%; height: 0;"></div>';
                    }
                    filtersHtml += `<div class="filter-item flex flex-col flex-shrink-0 ${containerWidthClass}">
                        <label for="filter-ilec-${column}" class="mb-1 text-sm font-medium text-gray-700">${column.replace(/_/g, ' ')}</label>
                        <select id="filter-ilec-${column}" data-column="${column}" multiple class="pubsec-ilec-filter w-full">`;
                    options.forEach(option => {
                        filtersHtml += `<option value="${option}">${option}</option>`;
                    });
                    filtersHtml += `</select></div>`;
                }
                filtersContainer.innerHTML = filtersHtml;
            }

            const allFilters = document.querySelectorAll('.pubsec-ilec-filter');
            allFilters.forEach(filter => {
                const choicesInstance = new Choices(filter, {removeItemButton: true});
                pubsecIlecChoicesInstances.push(choicesInstance);
            });

            data.all_columns.forEach(column => {
                const isChecked = data.default_columns.includes(column);
                columnListContainer.innerHTML += `
                    <div class="checkbox-item">
                        <input type="checkbox" id="col-ilec-${column}" value="${column}" ${isChecked ? 'checked' : ''}>
                        <label for="col-ilec-${column}">${column.replace(/_/g, ' ')}</label>
                    </div>`;
            });

            tableContainer.innerHTML = data.table_html;
            controlsDiv.style.display = 'flex';
            document.getElementById('pubsec-ilec-apply-filters-btn').addEventListener('click', updatePubsecIlecView);
            document.getElementById('pubsec-ilec-reset-filters-btn').addEventListener('click', resetPubsecIlecFilters);

            if (document.getElementById('pmo-submit-btn') || document.getElementById('pod-submit-btn')) {
                setupPubsecIlecWritebackPanel();
            }

        } else {
            tableContainer.innerHTML = `<p class="error-message">Error: ${data.message}</p>`;
        }
    } catch (error) {
        tableContainer.innerHTML = `<p class="error-message">Failed to load data. ${error.message}</p>`;
        showToast('Failed to load Pubsec ILEC data.', 'error');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

function resetPubsecIlecFilters() {
    pubsecIlecChoicesInstances.forEach(instance => instance.removeActiveItems());
    showToast('Filters have been reset.');
    updatePubsecIlecView();
}

async function updatePubsecIlecView() {
    const loadingDiv = document.getElementById('pubsec-ilec-loading');
    const tableContainer = document.getElementById('pubsec-ilec-table-container');
    const checkboxes = document.querySelectorAll('#pubsec-ilec-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select at least one column to display.', 'error');
        return;
    }

    const filterSelects = document.querySelectorAll('#pubsec-ilec-filters-container select');
    const filters = {};
    filterSelects.forEach(select => {
        const selectedValues = Array.from(select.selectedOptions).map(option => option.value);
        if (selectedValues.length > 0) {
            filters[select.dataset.column] = selectedValues;
        }
    });

    loadingDiv.style.display = 'block';
    tableContainer.innerHTML = '';

    try {
        const response = await fetch('/pubsec-ilec', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({columns: selectedColumns, filters: filters})
        });
        const data = await response.json();

        if (data.status === 'success') {
            if (data.stats) {
                const summaryContainer = document.getElementById('pubsec-ilec-summary-cards');
                const stats = data.stats;
                summaryContainer.innerHTML = `
                    <div class="stat-card"><h4>TDM Circuits</h4><p>${stats.tdm_circuits}</p></div>
                    <div class="stat-card"><h4>DSL Circuits</h4><p>${stats.dsl_circuits}</p></div>
                    <div class="stat-card"><h4>Overlapping Circuits</h4><p>${stats.overlap_circuits}</p></div>
                `;
            }
            tableContainer.innerHTML = data.table_html;
        } else {
            tableContainer.innerHTML = `<p class="error-message">Error updating view: ${data.message}</p>`;
            showToast(data.message, 'error');
        }
    } catch (error) {
        tableContainer.innerHTML = `<p class="error-message">An unexpected error occurred.</p>`;
        showToast('Failed to update the view.', 'error');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

function downloadPubsecIlecData(format) {
    const checkboxes = document.querySelectorAll('#pubsec-ilec-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select columns to include in the download.', 'error');
        return;
    }

    const filterSelects = document.querySelectorAll('#pubsec-ilec-filters-container select');
    const filters = {};
    filterSelects.forEach(select => {
        const selectedValues = Array.from(select.selectedOptions).map(option => option.value);
        if (selectedValues.length > 0) {
            filters[select.dataset.column] = selectedValues;
        }
    });

    const params = new URLSearchParams({
        format: format,
        columns: selectedColumns.join(',')
    });

    for (const key in filters) {
        filters[key].forEach(value => params.append(`filter_${key}`, value));
    }

    window.location.href = `/download_pubsec_ilec_data?${params.toString()}`;
    showToast(`Starting ${format.toUpperCase()} download...`, 'success');
}


// ==========================================================================
//  Pubsec ILEC Writeback Functions
// ==========================================================================
function formatDateString(dateStr) {
    if (!dateStr) return null;
    const mmDdYyyyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateStr.match(mmDdYyyyRegex);

    if (match) {
        const month = match[1].padStart(2, '0');
        const day = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return dateStr;
}

function openWritebackTab(evt, tabName) {
    document.querySelectorAll('.writeback-tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.sub-nav-tab').forEach(button => button.classList.remove('active'));
    document.getElementById(tabName + 'WritebackForm').style.display = 'block';
    evt.currentTarget.classList.add('active');
}

function clearWritebackFormInputs(formId) {
    const formContainer = document.getElementById(formId);
    if (!formContainer) return;
    formContainer.querySelectorAll('input, textarea, select').forEach(input => {
        if (input.type === 'radio' || input.type === 'checkbox') return;
        if (input.tagName.toLowerCase() === 'select') input.selectedIndex = 0;
        else input.value = '';
    });
}

function setupPubsecIlecWritebackPanel() {
    const firstTabButton = document.querySelector('.sub-nav-tab');
    if (firstTabButton) firstTabButton.click();

    const pmoSubmitBtn = document.getElementById('pmo-submit-btn');
    if (pmoSubmitBtn) {
        pmoSubmitBtn.addEventListener('click', submitPmoUpdate);
        document.querySelectorAll('input[name="pmoUpdateMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('panel-pmo-single').style.display = (e.target.value === 'single') ? 'block' : 'none';
                document.getElementById('panel-pmo-paste').style.display = (e.target.value === 'paste') ? 'block' : 'none';
            });
        });
    }

    const podSubmitBtn = document.getElementById('pod-submit-btn');
    if (podSubmitBtn) {
        podSubmitBtn.addEventListener('click', submitPodUpdate);
        document.querySelectorAll('input[name="podUpdateMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('panel-pod-single').style.display = (e.target.value === 'single') ? 'block' : 'none';
                document.getElementById('panel-pod-paste').style.display = (e.target.value === 'paste') ? 'block' : 'none';
            });
        });
    }
}

async function validatePastedCircuits(records) {
    const circuitIdsToValidate = records.map(rec => rec.circuit_id);
    showToast('Validating circuits...');
    const response = await fetch('/pubsec-ilec-validate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({circuit_ids: circuitIdsToValidate})
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Validation request failed.');
    }
    let confirmMsg = `You submitted ${records.length} total records.\n\n` +
        `✅ Matched Circuits: ${result.matched_count}\n` +
        `❌ Unmatched Circuits: ${result.unmatched_count}\n\n`;
    if (result.unmatched_count > 0) {
        confirmMsg += `Unmatched examples: ${result.unmatched_ids_sample.join(', ')}\n\n`;
    }
    confirmMsg += 'Do you want to proceed and process all records?';
    return confirm(confirmMsg);
}

async function submitPmoUpdate() {
    const updateMethod = document.querySelector('input[name="pmoUpdateMethod"]:checked').value;
    let payload = {method: updateMethod};

    if (updateMethod === 'paste') {
        const pastedList = document.getElementById('pmo-paste-list').value.trim();
        if (!pastedList) {
            showToast('Please paste data.', 'error');
            return;
        }

        const records = pastedList.split('\n').map(row => {
            const cols = row.split('\t');
            if (cols.length !== 4) return null;
            return {
                circuit_id: cols[0].trim(),
                pmo_status: cols[1].trim(),
                pmo_notes: cols[2].trim(),
                pmo_contract: cols[3].trim()
            };
        }).filter(r => r);

        if (records.length === 0) {
            showToast('No valid records found in pasted data.', 'error');
            return;
        }

        try {
            const userConfirmed = await validatePastedCircuits(records);
            if (!userConfirmed) {
                showToast('Update cancelled.');
                return;
            }
        } catch (e) {
            showToast(`Validation failed: ${e.message}`, 'error');
            return;
        }
        payload.records = records;

    } else {
        const circuitId = document.getElementById('pmo-circuit-id').value.trim();
        if (!circuitId) {
            showToast('Circuit ID is required.', 'error');
            return;
        }
        if (!confirm(`Submit PMO update for ${circuitId}?`)) {
            showToast('Update cancelled.');
            return;
        }

        payload.circuit_id = circuitId;
        payload.pmo_status = document.getElementById('pmo-status').value;
        payload.pmo_notes = document.getElementById('pmo-notes').value;
        payload.pmo_contract = document.getElementById('pmo-contract').value;
    }

    try {
        const response = await fetch('/pubsec-ilec-writeback-pmo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(result.message, 'success');
            clearWritebackFormInputs('pmoWritebackForm');
        } else {
            showToast(result.message, 'error');
        }
    } catch (e) {
        showToast('An error occurred while submitting.', 'error');
    }
}

async function submitPodUpdate() {
    const updateMethod = document.querySelector('input[name="podUpdateMethod"]:checked').value;
    let payload = {method: updateMethod};

    if (updateMethod === 'paste') {
        const pastedList = document.getElementById('pod-paste-list').value.trim();
        if (!pastedList) {
            showToast('Please paste data.', 'error');
            return;
        }

        const records = pastedList.split('\n').map(row => {
            const cols = row.split('\t');
            if (cols.length !== 11) return null;
            return {
                circuit_id: cols[0].trim(),
                revised_cid: cols[1].trim(),
                revised_ecckt: cols[2].trim(),
                decomm_date: formatDateString(cols[3].trim()),
                disposition: cols[4].trim(),
                pod_last_updated_date: formatDateString(cols[5].trim()),
                pod_note: cols[6].trim(),
                circuit_disposition: cols[7].trim(),
                network_disposition: cols[8].trim(),
                bl_status: cols[9].trim(),
                order_num: cols[10].trim()
            };
        }).filter(r => r);

        if (records.length === 0) {
            showToast('No valid records found in pasted data.', 'error');
            return;
        }

        try {
            const userConfirmed = await validatePastedCircuits(records);
            if (!userConfirmed) {
                showToast('Update cancelled.');
                return;
            }
        } catch (e) {
            showToast(`Validation failed: ${e.message}`, 'error');
            return;
        }
        payload.records = records;

    } else {
        const circuitId = document.getElementById('pod-circuit-id').value.trim();
        if (!circuitId) {
            showToast('Circuit ID is required.', 'error');
            return;
        }
        if (!confirm(`Submit POD update for ${circuitId}?`)) {
            showToast('Update cancelled.');
            return;
        }

        payload.circuit_id = circuitId;
        payload.revised_cid = document.getElementById('pod-revised-cid').value;
        payload.revised_ecckt = document.getElementById('pod-revised-ecckt').value;
        payload.decomm_date = document.getElementById('pod-decomm-date').value;
        payload.disposition = document.getElementById('pod-disposition').value;
        payload.pod_last_updated_date = document.getElementById('pod-last-updated').value;
        payload.pod_note = document.getElementById('pod-note').value;
        payload.circuit_disposition = document.getElementById('pod-circuit-disposition').value;
        payload.network_disposition = document.getElementById('pod-network-disposition').value;
        payload.bl_status = document.getElementById('pod-bl-status').value;
        payload.order_num = document.getElementById('pod-order-num').value;
    }

    try {
        const response = await fetch('/pubsec-ilec-writeback-pod', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(result.message, 'success');
            clearWritebackFormInputs('podWritebackForm');
        } else {
            showToast(result.message, 'error');
        }
    } catch (e) {
        showToast('An error occurred while submitting.', 'error');
    }
}


// ==========================================================================
//  FWA Viewer Functions
// ==========================================================================

async function initializeFwaTool() {
    isFwaInitialized = true;
    const loadingDiv = document.getElementById('fwa-loading');
    const summaryContainer = document.getElementById('fwa-summary-cards');
    const columnListContainer = document.getElementById('fwa-column-list');
    const tableContainer = document.getElementById('fwa-table-container');
    const controlsDiv = document.getElementById('fwa-controls');
    const filtersContainer = document.getElementById('fwa-filters-container');

    loadingDiv.style.display = 'block';
    summaryContainer.innerHTML = '';
    columnListContainer.innerHTML = '';
    tableContainer.innerHTML = '';
    filtersContainer.innerHTML = '';

    try {
        const response = await fetch('/fwa');
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const data = await response.json();

        if (data.status === 'success') {
            const stats = data.stats;
            summaryContainer.innerHTML = `
                <div class="stat-card"><h4>Original Records</h4><p>${stats.total_submitted}</p></div>
                <div class="stat-card"><h4>Records Found</h4><p>${stats.found_in_wireless}</p></div>
                <div class="stat-card"><h4>WIFI Backup</h4><p>${stats.wifi_backup}</p></div>
            `;

            if (data.filter_options) {
                filtersContainer.classList.add('flex', 'flex-wrap', 'items-end', 'gap-4', 'mb-4');
                for (const column in data.filter_options) {
                    const options = data.filter_options[column];
                    let selectHtml = `<div class="filter-item flex flex-col">
                        <label for="filter-${column}" class="mb-1 text-sm font-medium text-gray-700">${column.replace(/_/g, ' ')}</label>
                        <select id="filter-${column}" data-column="${column}" class="w-48 p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">All</option>`;
                    options.forEach(option => {
                        selectHtml += `<option value="${option}">${option}</option>`;
                    });
                    selectHtml += `</select></div>`;
                    filtersContainer.innerHTML += selectHtml;
                }
            }

            data.all_columns.forEach(column => {
                const isChecked = data.default_columns.includes(column);
                columnListContainer.innerHTML += `
                    <div class="checkbox-item">
                        <input type="checkbox" id="col-${column}" value="${column}" ${isChecked ? 'checked' : ''}>
                        <label for="col-${column}">${column.replace(/_/g, ' ')}</label>
                    </div>`;
            });

            tableContainer.innerHTML = data.table_html;
            controlsDiv.style.display = 'flex';

            if (document.getElementById('fwa-submit-outreach-btn')) {
                setupUpdateOutreachPanel();
            }

            document.getElementById('fwa-apply-filters-btn').addEventListener('click', updateFwaView);
            document.getElementById('fwa-reset-filters-btn').addEventListener('click', resetFwaFilters);

        } else {
            tableContainer.innerHTML = `<p class="error-message">Error: ${data.message}</p>`;
        }
    } catch (error) {
        tableContainer.innerHTML = `<p class="error-message">Failed to load data. ${error.message}</p>`;
        showToast('Failed to load FWA data.', 'error');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

function resetFwaFilters() {
    const filterSelects = document.querySelectorAll('#fwa-filters-container select');
    filterSelects.forEach(select => {
        select.value = "";
    });
    showToast('Filters have been reset.');
    updateFwaView();
}

async function updateFwaView() {
    const loadingDiv = document.getElementById('fwa-loading');
    const tableContainer = document.getElementById('fwa-table-container');
    const checkboxes = document.querySelectorAll('#fwa-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select at least one column to display.', 'error');
        return;
    }

    const filterSelects = document.querySelectorAll('#fwa-filters-container select');
    const filters = {};
    filterSelects.forEach(select => {
        if (select.value) filters[select.dataset.column] = select.value;
    });

    loadingDiv.style.display = 'block';
    tableContainer.innerHTML = '';

    try {
        const response = await fetch('/fwa', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({columns: selectedColumns, filters: filters})
        });
        const data = await response.json();

        if (data.status === 'success') {
            if (data.stats) {
                const summaryContainer = document.getElementById('fwa-summary-cards');
                const stats = data.stats;
                summaryContainer.innerHTML = `
                    <div class="stat-card"><h4>Original Records</h4><p>${stats.total_submitted}</p></div>
                    <div class="stat-card"><h4>Records Found</h4><p>${stats.found_in_wireless}</p></div>
                    <div class="stat-card"><h4>WIFI Backup</h4><p>${stats.wifi_backup}</p></div>
                `;
            }
            tableContainer.innerHTML = data.table_html;
            fwaFilteredRecordCount = data.filtered_count || 0;
        } else {
            tableContainer.innerHTML = `<p class="error-message">Error updating view: ${data.message}</p>`;
            showToast(data.message, 'error');
        }
    } catch (error) {
        tableContainer.innerHTML = `<p class="error-message">An unexpected error occurred.</p>`;
        showToast('Failed to update the view.', 'error');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

function setupUpdateOutreachPanel() {
    const mainDatePickers = document.querySelector('.writeback-controls');
    document.querySelectorAll('input[name="updateMethod"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.update-panel').forEach(p => p.style.display = 'none');
            document.getElementById(`panel-${e.target.value}`).style.display = 'block';

            if (mainDatePickers) {
                mainDatePickers.style.display = (e.target.value === 'paste') ? 'none' : 'flex';
            }
        });
    });

    document.getElementById('fwa-submit-outreach-btn').addEventListener('click', submitFwaOutreach);
}

async function submitFwaOutreach() {
    const updateMethod = document.querySelector('input[name="updateMethod"]:checked').value;
    let payload = {};
    let recordCount = 0;

    if (updateMethod === 'paste') {
        const pastedList = document.getElementById('pasted-mdn-list').value.trim();
        if (!pastedList) {
            showToast('Please paste data into the text area.', 'error');
            return;
        }
        const rows = pastedList.split('\n');
        const records = rows.map(row => {
            const columns = row.split('\t');
            if (columns.length !== 4) return null;
            return {
                mdn: columns[0].trim(),
                outreach_date: columns[1].trim(),
                target_date: columns[2].trim(),
                status: columns[3].trim()
            };
        }).filter(record => record);

        if (records.length === 0) {
            showToast('No valid records found. Ensure format is: MDN, Outreach Date, Target Date, Status (separated by tabs).', 'error');
            return;
        }
        payload = {method: 'paste', records: records};
        recordCount = records.length;

    } else {
        const outreachDate = document.getElementById('outreach-date').value;
        const targetDate = document.getElementById('target-date').value;
        const outreachStatus = document.getElementById('outreach-status-select').value;

        if (!outreachDate || !targetDate) {
            showToast('Please select both an Outreach Date and a Target Date.', 'error');
            return;
        }

        const singleMdn = document.getElementById('single-mdn-input').value.trim();
        if (!singleMdn) {
            showToast('Please enter an MDN_5G.', 'error');
            return;
        }

        payload = {
            method: 'standard',
            ids: [singleMdn],
            outreach_date: outreachDate,
            target_date: targetDate,
            status: outreachStatus
        };
        recordCount = 1;
    }

    if (!confirm(`You are about to submit an outreach update for ${recordCount} record(s). Continue?`)) {
        return;
    }
    showToast(`Submitting outreach for ${recordCount} records...`);

    try {
        const response = await fetch('/fwa-writeback', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast(result.message, 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (error) {
        showToast('An error occurred while submitting data.', 'error');
        console.error('Write-back error:', error);
    }
}

function downloadFwaData(format, scope) {
    const checkboxes = document.querySelectorAll('#fwa-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select columns to include in the download.', 'error');
        return;
    }

    const filterSelects = document.querySelectorAll('#fwa-filters-container select');
    const filters = {};
    filterSelects.forEach(select => {
        if (select.value) {
            filters[select.dataset.column] = select.value;
        }
    });

    const params = new URLSearchParams({
        format: format,
        scope: scope,
        columns: selectedColumns.join(',')
    });

    for (const key in filters) {
        params.append(`filter_${key}`, filters[key]);
    }

    const downloadUrl = `/download_fwa_data?${params.toString()}`;
    window.location.href = downloadUrl;
    showToast(`Starting ${format.toUpperCase()} download...`, 'success');
}


// ==========================================================================
// RCM2 Tool Functions - CACHED & OPTIMIZED
// ==========================================================================

async function initializeRcm2Tool() {
    isRcm2Initialized = true;
    const loadingDiv = document.getElementById('rcm-loading');
    const tableContainer = document.getElementById('rcm-table-container');
    const filtersContainer = document.getElementById('rcm-filters-container');
    const columnListContainer = document.getElementById('rcm-column-list');

    if (loadingDiv) loadingDiv.style.display = 'block';
    if (rcmPollTimer) clearTimeout(rcmPollTimer);
    if (tableContainer && tableContainer.innerHTML === "") tableContainer.innerHTML = '';

    rcm2ChoicesInstances = [];

    try {
        const response = await fetch('/rcm2');
        const data = await response.json();

        if (data.status === 'success') {
            if (loadingDiv) loadingDiv.style.display = 'none';
            rcmInitialData = data;

            const dateSpan = document.getElementById('rcm-last-refreshed');
            if (dateSpan && data.last_refreshed) dateSpan.textContent = data.last_refreshed;

            updateRcm2UI(data);

            if (data.filter_options && filtersContainer && filtersContainer.innerHTML.trim() === "") {
                let filtersHtml = '';
                for (const column in data.filter_options) {
                    const options = data.filter_options[column];
                    const label = column.replace(/_/g, ' ');
                    filtersHtml += `<div class="filter-item flex flex-col">
                        <label class="mb-1 text-sm font-medium text-gray-700">${label}</label>
                        <select data-column="${column}" multiple class="rcm-filter w-full">`;
                    options.forEach(option => {
                        filtersHtml += `<option value="${option}">${option}</option>`;
                    });
                    filtersHtml += `</select></div>`;
                }
                filtersContainer.innerHTML = filtersHtml;

                document.querySelectorAll('.rcm-filter').forEach(filter => {
                    if (typeof Choices !== 'undefined') {
                        const instance = new Choices(filter, {
                            removeItemButton: true,
                            duplicateItemsAllowed: false,
                            itemSelectText: ''
                        });
                        rcm2ChoicesInstances.push(instance);
                    }
                });
            }

            if (data.all_columns && columnListContainer && columnListContainer.innerHTML.trim() === "") {
                columnListContainer.innerHTML = '';
                data.all_columns.forEach(column => {
                    const isChecked = data.default_columns.includes(column);
                    columnListContainer.innerHTML += `
                        <div class="checkbox-item">
                            <input type="checkbox" id="col-rcm-${column}" value="${column}" ${isChecked ? 'checked' : ''}>
                            <label for="col-rcm-${column}">${column.replace(/_/g, ' ')}</label>
                        </div>`;
                });
            }
        } else {
            if (loadingDiv) loadingDiv.style.display = 'none';
            if (data.message.toLowerCase().includes("wait") || data.message.toLowerCase().includes("loading")) {
                if (tableContainer) {
                    tableContainer.innerHTML = `
                        <div style="text-align:center; padding: 40px; color: #666;">
                            <div class="spinner-border text-primary" role="status" style="margin-bottom: 15px;"></div>
                            <h3 style="font-size: 1.2rem; font-weight: bold;">System is initializing...</h3>
                            <p style="margin-top:10px;">${data.message}</p>
                            <p style="font-size: 0.9rem; margin-top:5px; color: #888;">(Background Load of records in progress)</p>
                        </div>
                    `;
                }
                isRcm2Initialized = false;
                rcmPollTimer = setTimeout(initializeRcm2Tool, 5000);
            } else {
                showToast(data.message, 'error');
                if (tableContainer) tableContainer.innerHTML = `<p class="error-message">Error: ${data.message}</p>`;
            }
        }
    } catch (error) {
        console.error(error);
        if (loadingDiv) loadingDiv.style.display = 'none';
        showToast('Error connecting to server.', 'error');
    } finally {
        const applyBtn = document.getElementById('rcm-apply-filters-btn');
        if (applyBtn) applyBtn.onclick = updateRcm2View;
        const resetBtn = document.getElementById('rcm-reset-filters-btn');
        if (resetBtn) resetBtn.onclick = resetRcm2Filters;
        const viewBtn = document.getElementById('rcm-update-view-btn');
        if (viewBtn) viewBtn.onclick = updateRcm2View;
    }
}

async function updateRcm2View() {
    const loadingDiv = document.getElementById('rcm-loading');
    const tableContainer = document.getElementById('rcm-table-container');

    const checkboxes = document.querySelectorAll('#rcm-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select at least one column.', 'error');
        return;
    }

    let filters = {};
    rcm2ChoicesInstances.forEach(instance => {
        const column = instance.passedElement.element.dataset.column;
        const values = instance.getValue(true);
        if (values && values.length > 0) {
            filters[column] = values;
        }
    });

    if (loadingDiv) loadingDiv.style.display = 'block';
    if (tableContainer) tableContainer.innerHTML = '';

    try {
        const response = await fetch('/rcm2', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({columns: selectedColumns, filters: filters})
        });
        const data = await response.json();

        if (data.status === 'success') {
            updateRcm2UI(data);
            if (data.filter_options) {
                rcm2ChoicesInstances.forEach(instance => {
                    const column = instance.passedElement.element.dataset.column;
                    const newOptionsRaw = data.filter_options[column];

                    if (newOptionsRaw) {
                        const currentSelection = instance.getValue(true);
                        const uniqueOptionsSet = new Set(newOptionsRaw.map(String));
                        const uniqueOptions = Array.from(uniqueOptionsSet).sort();

                        instance.setChoices(
                            uniqueOptions.map(val => ({
                                value: val,
                                label: val,
                                selected: currentSelection.includes(val),
                                disabled: false
                            })),
                            'value', 'label', true
                        );
                    }
                });
            }
        } else {
            showToast(data.message, 'error');
            if (tableContainer) tableContainer.innerHTML = `<p class="error-message">${data.message}</p>`;
        }
    } catch (error) {
        showToast('Error updating view.', 'error');
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

function resetRcm2Filters() {
    rcm2ChoicesInstances.forEach(instance => instance.removeActiveItems());

    if (rcmInitialData) {
        console.log("Restoring RCM view from cache...");
        updateRcm2UI(rcmInitialData);

        if (rcmInitialData.filter_options) {
            rcm2ChoicesInstances.forEach(instance => {
                const column = instance.passedElement.element.dataset.column;
                const originalOptions = rcmInitialData.filter_options[column];

                if (originalOptions) {
                    const uniqueOptionsSet = new Set(originalOptions.map(String));
                    const uniqueOptions = Array.from(uniqueOptionsSet).sort();

                    instance.setChoices(
                        uniqueOptions.map(val => ({
                            value: val,
                            label: val,
                            selected: false,
                            disabled: false
                        })),
                        'value', 'label', true
                    );
                }
            });
        }
        showToast('Filters reset (Instant).');
    } else {
        console.log("Cache missing, fetching original data...");
        updateRcm2View();
    }
}

function applyRcmStatFilter(column, value) {
    const instance = rcm2ChoicesInstances.find(c => c.passedElement.element.dataset.column === column);
    if (instance) {
        instance.removeActiveItems();
        instance.setChoiceByValue(value);
        showToast(`Filtering by ${column}: ${value}`);
        updateRcm2View();
    } else {
        console.error(`Filter dropdown for ${column} not found.`);
        showToast(`Filter for ${column} is not available in the UI.`, 'error');
    }
}

function updateRcm2UI(data) {
    const summaryContainer = document.getElementById('rcm-summary-cards');
    const tableContainer = document.getElementById('rcm-table-container');
    const controlsDiv = document.getElementById('rcm-controls');
    const downloadWarning = document.getElementById('rcm-download-warning');
    const previewNote = document.getElementById('rcm-preview-note');

    const stats = data.stats || {};
    let totalRecords = 0;
    if (data.filtered_count !== undefined) {
        totalRecords = parseInt(String(data.filtered_count).replace(/,/g, ''), 10);
    } else if (stats.total_records) {
        totalRecords = parseInt(String(stats.total_records).replace(/,/g, ''), 10);
    }

    const MAX_DOWNLOAD_ROWS = 2000000;
    if (totalRecords > MAX_DOWNLOAD_ROWS) {
        if (controlsDiv) controlsDiv.style.display = 'none';
        if (downloadWarning) downloadWarning.style.display = 'block';
        if (previewNote) previewNote.style.display = 'none';
    } else if (totalRecords === 0) {
        if (controlsDiv) controlsDiv.style.display = 'none';
        if (downloadWarning) downloadWarning.style.display = 'none';
        if (previewNote) previewNote.style.display = 'none';
    } else {
        if (controlsDiv) controlsDiv.style.display = 'flex';
        if (downloadWarning) downloadWarning.style.display = 'none';
        if (previewNote) previewNote.style.display = 'block';
    }

    if (!summaryContainer || !tableContainer) return;

    let statsHtml = `<div class="stat-card"><h4>Unique Circuit IDs</h4><p>${stats.unique_circuits || 0}</p></div>`;
    statsHtml += `<div class="stat-card"><h4>Unique Wire Centers</h4><p>${stats.unique_wire_ctr || 0}</p></div>`;
    statsHtml += `<div class="stat-card"><h4>Unique NASP IDs</h4><p>${stats.unique_nasp || 0}</p></div>`;

    if (stats.assigned_records) {
        statsHtml += `<div class="stat-card clickable-card" onclick="applyRcmStatFilter('NASP_ASSIGNED', 'Y')"><h4>Assigned NASP</h4><p>${stats.assigned_records}</p></div>`;
        statsHtml += `<div class="stat-card clickable-card" onclick="applyRcmStatFilter('NASP_ASSIGNED', 'N')"><h4>Unassigned NASP</h4><p>${stats.unassigned_records}</p></div>`;
    }

    statsHtml += `<div class="stat-card total-card"><h4>Total Records</h4><p>${stats.total_records || 0}</p></div>`;
    summaryContainer.innerHTML = statsHtml;

    if (data.table_html) {
        tableContainer.innerHTML = data.table_html;
        if (typeof addTooltipsToTruncatedCells === 'function') {
            addTooltipsToTruncatedCells(tableContainer);
        }
    } else {
        tableContainer.innerHTML = '<p>No data received from server.</p>';
    }
}

function downloadRcmData(format) {
    const checkboxes = document.querySelectorAll('#rcm-column-list input[type="checkbox"]:checked');
    const selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        showToast('Please select columns to download.', 'error');
        return;
    }

    const params = new URLSearchParams({
        format: format,
        columns: selectedColumns.join(',')
    });

    if (rcm2ChoicesInstances && rcm2ChoicesInstances.length > 0) {
        rcm2ChoicesInstances.forEach(instance => {
            const column = instance.passedElement.element.dataset.column;
            const values = instance.getValue(true);

            if (values) {
                const valuesArray = Array.isArray(values) ? values : [values];
                valuesArray.forEach(v => {
                    if (v !== null && v !== "") {
                        params.append(`filter_${column}`, v);
                    }
                });
            }
        });
    }

    window.location.href = `/download_rcm2_data?${params.toString()}`;
    showToast(`Starting ${format.toUpperCase()} download...`, 'success');
}


// ==========================================================================
// FRN Dashboard Tool Functions
// ==========================================================================

const FRN_PIVOT_COLUMNS_DEFAULT = [
    'STATE', 'WIRE_CENTER_CLLI', 'LOB', 'CUST_SEG_LEVEL1_NAME', 'NETWORKCAPABILITY', 'BUNDLEDESC',
    'Total_WTNs', 'Total_MRC', 'Clearance_Priority', '% Fiber Capable', 'High_Value_Legacy_Leads'
];
const FRN_DETAIL_COLUMNS_DEFAULT = [
    'WTN', 'UNIVERSALSERVICEID', 'STATE', 'CITY', 'LOB',
    'CUST_SEG_LEVEL1_NAME', 'NETWORKCAPABILITY', 'BUNDLE_DESC', 'MRC', 'MAX_CAPABLE_SPEED',
    'LINE_CARD_TYPE_DESC'
];

async function initializeFrnTool() {
    isFrnInitialized = true;
    const loadingDiv = document.getElementById('frn-loading');
    const filtersContainer = document.getElementById('frn-filters-container');
    const colContainer = document.getElementById('frn-column-list');

    if (loadingDiv) loadingDiv.style.display = 'block';

    try {
        const response = await fetch('/frn');
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const data = await response.json();

        if (data.status === 'success') {
            const timestampSpan = document.getElementById('frn-data-date-display');
            if (timestampSpan) {
                timestampSpan.textContent = data.last_refreshed;
            }

            frnAllColumns['pivot_view'] = data.pivot_all_columns || FRN_PIVOT_COLUMNS_DEFAULT;
            frnDefaultColumns['pivot_view'] = data.pivot_all_columns || FRN_PIVOT_COLUMNS_DEFAULT;
            frnAllColumns['data_view'] = data.detail_all_columns || FRN_DETAIL_COLUMNS_DEFAULT;
            frnDefaultColumns['data_view'] = data.detail_default_columns || FRN_DETAIL_COLUMNS_DEFAULT;

            if (filtersContainer) {
                let filtersHtml = '';

                // --- NEW: Inject the custom 'Wire Center Defined' dropdown ---
                filtersHtml += `
                    <div class="filter-item flex flex-col" style="margin-bottom: 10px;">
                        <label class="mb-1 text-sm font-medium text-gray-700">Wire Center Defined?</label>
                        <select id="frn-defined-wc-filter" class="frn-static-filter w-full p-2 border border-gray-300 rounded-md text-sm">
                            <option value="">All</option>
                            <option value="KNOWN">Only Defined Wire Centers</option>
                            <option value="UNKNOWN">Only 'Unknown' Wire Centers</option>
                        </select>
                    </div>
                `;

                if (data.filter_options && Object.keys(data.filter_options).length > 0) {
                    for (const column in data.filter_options) {
                        const options = data.filter_options[column];
                        const labelText = column.replace(/_/g, ' ');
                        filtersHtml += `<div class="filter-item flex flex-col" style="margin-bottom: 10px;">
                                <label class="mb-1 text-sm font-medium text-gray-700">${labelText}</label>
                                <select data-column="${column}" multiple class="frn-filter w-full">`;
                        options.forEach(option => {
                            filtersHtml += `<option value="${option}">${option}</option>`;
                        });
                        filtersHtml += `</select></div>`;
                    }
                    filtersContainer.innerHTML = filtersHtml;

                    document.querySelectorAll('.frn-filter').forEach(filter => {
                        if (typeof Choices !== 'undefined') {
                            frnChoicesInstances.push(new Choices(filter, {removeItemButton: true, itemSelectText: ''}));
                        }
                    });
                }

                // --- Apply Choices.js styling to our static dropdown ---
                if (typeof Choices !== 'undefined') {
                    const staticFilterElement = document.getElementById('frn-defined-wc-filter');
                    if (staticFilterElement) {
                        frnDefinedWcChoiceInstance = new Choices(staticFilterElement, {
                            searchEnabled: false, // No need for a search bar for 3 options
                            itemSelectText: '',
                            shouldSort: false
                        });
                    }
                }
            }

            if (colContainer) {
                populateFrnColumnSelector(frnAllColumns[frnCurrentView], frnDefaultColumns[frnCurrentView]);
            }

            // --- Apply Defaults before first render ---
            if (frnDefinedWcChoiceInstance) {
                frnDefinedWcChoiceInstance.setChoiceByValue('KNOWN');
            }
            frnChoicesInstances.forEach(instance => {
                if (instance.passedElement.element.dataset.column === 'ACTIVE_COPPER') {
                    instance.setChoiceByValue('Y');
                }
            });
            // ----------------------------------------------

            try {
                updateFrnView();
            } catch (uiError) {
                console.error("Error drawing tables or charts:", uiError);
            }

            const applyBtn = document.getElementById('frn-apply-filters-btn');
            if (applyBtn) applyBtn.addEventListener('click', () => updateFrnView());

            const resetBtn = document.getElementById('frn-reset-filters-btn');
            if (resetBtn) resetBtn.addEventListener('click', resetFrnFilters);

            const updateViewBtn = document.getElementById('frn-update-view-btn');
            if (updateViewBtn) updateViewBtn.addEventListener('click', updateFrnView);

        } else {
            showToast(data.message || 'Error loading initial data.', 'error');
        }
    } catch (error) {
        showToast(`Failed to load FRN tool. Check console for details.`, 'error');
        console.error("FRN Tool Init Error:", error);
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

async function updateFrnView() {
    const loadingDiv = document.getElementById('frn-loading');
    if (loadingDiv) loadingDiv.style.display = 'block';

    const checkboxes = document.querySelectorAll('#frn-column-list input[type="checkbox"]:checked');
    let selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        if (frnCurrentView === 'pivot_view') {
            selectedColumns = ['STATE', 'WIRE_CENTER_CLLI', 'LOB', 'CUST_SEG_LEVEL1_NAME', 'NETWORKCAPABILITY', 'BUNDLEDESC'];
        } else if (frnCurrentView === 'data_view') {
            selectedColumns = frnDefaultColumns['data_view'] || frnAllColumns['data_view'];
        }
    }

    const chartRadio = document.querySelector('input[name="chart_group_radio"]:checked');
    let chartGroupCol = chartRadio ? chartRadio.value : 'LOB';

    const scatterRadio = document.querySelector('input[name="scatter_group_radio"]:checked');
    let scatterGroupCol = scatterRadio ? scatterRadio.value : 'WIRE_CENTER_CLLI';

    const mapRadio = document.querySelector('input[name="map_view_radio"]:checked');
    let mapViewType = mapRadio ? mapRadio.value : 'state';

    let filters = {...frnClickFilter};

    frnChoicesInstances.forEach(instance => {
        const column = instance.passedElement.element.dataset.column;
        const selectedValues = instance.getValue(true)?.filter(value => value !== "") || [];
        if (selectedValues.length > 0) {
            filters[column] = selectedValues;
        }
    });

    document.querySelectorAll('.frn-metric-filter').forEach(input => {
        const column = input.dataset.column;
        const value = input.value;
        if (value && value !== "" && value !== "0") {
            filters[column] = [value];
        }
    });

    // --- Grab value of static WC filter ---
    const definedWcFilter = document.getElementById('frn-defined-wc-filter');
    if (definedWcFilter && definedWcFilter.value) {
        filters['CLLI_CLEAN_DEFINED'] = [definedWcFilter.value];
    }

    lastAppliedFrnFilters = {...filters};

    if (frnCurrentView === 'ai_view') {
        if (loadingDiv) loadingDiv.style.display = 'none';
        generatePmoHitList();
        return;
    }

    try {
        const response = await fetch('/frn', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                view: frnCurrentView,
                columns: selectedColumns,
                filters: filters,
                chart_group_col: chartGroupCol,
                scatter_group_col: scatterGroupCol,
                map_view_type: mapViewType
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            updateFrnUI(data);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('An unexpected error occurred.', 'error');
        console.error(e);
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

function resetFrnFilters() {
    frnChoicesInstances.forEach(instance => {
        instance.removeActiveItems();
        // Restore Default
        if (instance.passedElement.element.dataset.column === 'ACTIVE_COPPER') {
            instance.setChoiceByValue('Y');
        }
    });

    document.querySelectorAll('.frn-metric-filter').forEach(input => input.value = '');

    // Restore Default Static Filter
    if (frnDefinedWcChoiceInstance) {
        frnDefinedWcChoiceInstance.setChoiceByValue('KNOWN');
    } else {
        const definedWcFilter = document.getElementById('frn-defined-wc-filter');
        if (definedWcFilter) definedWcFilter.value = 'KNOWN';
    }

    frnClickFilter = {};
    lastAppliedFrnFilters = {};
    showToast('Filters have been reset to default.');
    updateFrnView();
}

function populateFrnColumnSelector(allColumns, defaultColumns) {
    const container = document.getElementById('frn-column-list');
    if (!container) return;

    container.innerHTML = '';
    if (!allColumns) return;

    // Search bar and Select All / Deselect All buttons at the top
    container.innerHTML += `
        <div style="margin-bottom: 12px;">
            <input type="text" id="frn-col-search" placeholder="Search columns..." style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
            <button id="frn-select-all-cols" type="button" style="flex: 1; padding: 4px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #f9fafb;">Select All</button>
            <button id="frn-deselect-all-cols" type="button" style="flex: 1; padding: 4px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #f9fafb;">Clear All</button>
        </div>
        <div id="frn-column-checkboxes" style="max-height: 40vh; overflow-y: auto; overflow-x: hidden; padding-right: 5px;"></div>`;

    const cbContainer = document.getElementById('frn-column-checkboxes');

    allColumns.forEach(column => {
        const isChecked = defaultColumns.includes(column);
        const cleanLabel = column.replace(/_/g, ' ');
        cbContainer.innerHTML += `
            <div class="checkbox-item frn-col-item" data-label="${cleanLabel.toLowerCase()}">
                <input type="checkbox" class="frn-col-cb" id="col-frn-${column}" value="${column}" ${isChecked ? 'checked' : ''}>
                <label for="col-frn-${column}">${cleanLabel}</label>
            </div>`;
    });

    // Attach Search Event Listener
    document.getElementById('frn-col-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.frn-col-item').forEach(item => {
            item.style.display = item.dataset.label.includes(term) ? 'flex' : 'none';
        });
    });

    // Attach Event Listeners to the new buttons (Only selects currently visible items)
    document.getElementById('frn-select-all-cols').addEventListener('click', () => {
        document.querySelectorAll('#frn-column-list .frn-col-cb').forEach(cb => {
            if (cb.closest('.frn-col-item').style.display !== 'none') cb.checked = true;
        });
    });

    document.getElementById('frn-deselect-all-cols').addEventListener('click', () => {
        document.querySelectorAll('#frn-column-list .frn-col-cb').forEach(cb => {
            if (cb.closest('.frn-col-item').style.display !== 'none') cb.checked = false;
        });
    });
}

function switchFrnView(evt, viewName) {
    document.querySelectorAll('#frnRun .sub-nav-tab').forEach(button => button.classList.remove('active'));
    if (evt) evt.currentTarget.classList.add('active');

    document.getElementById('frn-data-container').style.display = 'none';
    document.getElementById('frn-pivot-container').style.display = 'none';
    document.getElementById('frn-chart-container').style.display = 'none';
    const aiContainer = document.getElementById('pmo-hitlist-container');
    if (aiContainer) aiContainer.style.display = 'none';

    const mapOptionsContainer = document.getElementById('frn-map-options-container');
    if (mapOptionsContainer) mapOptionsContainer.innerHTML = '';

    frnCurrentView = viewName;

    const btnCsv = document.getElementById('btn-download-csv');
    const btnExcel = document.getElementById('btn-download-excel');
    const imgGroup = document.getElementById('btn-download-image-group');

    if (viewName === 'chart_view') {
        if (btnCsv) btnCsv.style.display = 'none';
        if (btnExcel) btnExcel.style.display = 'none';
        if (imgGroup) {
            imgGroup.style.display = 'flex';
            document.getElementById('frn-controls').style.display = 'flex';
        }
    } else if (viewName === 'data_view' || viewName === 'pivot_view') {
        if (btnCsv) btnCsv.style.display = 'flex';
        if (btnExcel) btnExcel.style.display = 'flex';
        if (imgGroup) imgGroup.style.display = 'none';
    } else {
        if (btnCsv) btnCsv.style.display = 'none';
        if (btnExcel) btnExcel.style.display = 'none';
        if (imgGroup) imgGroup.style.display = 'none';
    }

    if (viewName === 'data_view') {
        document.getElementById('frn-data-container').style.display = 'block';
        document.getElementById('frn-current-view-name-sidebar').textContent = 'Select Columns (Raw Data)';
        populateFrnColumnSelector(frnAllColumns['data_view'], frnDefaultColumns['data_view']);
        if (evt) updateFrnView();

    } else if (viewName === 'pivot_view') {
        document.getElementById('frn-pivot-container').style.display = 'block';
        document.getElementById('frn-current-view-name-sidebar').textContent = 'Select Grouping (Pivot)';
        populateFrnColumnSelector(frnAllColumns['pivot_view'], frnDefaultColumns['pivot_view']);
        if (evt) updateFrnView();

    } else if (viewName === 'chart_view') {
        document.getElementById('frn-chart-container').style.display = 'block';
        document.getElementById('frn-current-view-name-sidebar').textContent = 'Select Chart Grouping';

        const chartCols = [
            {id: 'LOB', label: 'Group By: LOB'},
            {id: 'CUST_SEG_LEVEL1_NAME', label: 'Group By: Cust Segment'},
            {id: 'NETWORKCAPABILITY', label: 'Group By: Network Cap'},
            {id: 'BUNDLEDESC', label: 'Group By: Bundle Desc'},
            {id: 'LINE_CARD_TYPE_DESC', label: 'Group By: Line Card'}
        ];

        const scatterCols = [
            {id: 'WIRE_CENTER_CLLI', label: 'Scatter Plot: Wire Centers'},
            {id: 'STATE', label: 'Scatter Plot: States'}
        ];

        const mapCols = [
            {id: 'state', label: 'Map: State Density'},
            {id: 'geo', label: 'Map: Pinpoint Locations (Lat/Lon)'}
        ];

        const container = document.getElementById('frn-column-list');
        container.innerHTML = '';

        container.innerHTML += `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Chart Type</p>`;
        container.innerHTML += `
            <div class="checkbox-item" style="margin-bottom: 4px;">
                <input type="radio" name="chart_type_radio" id="chart-type-bar" value="bar" checked onchange="updateFrnView()">
                <label for="chart-type-bar">Bar Chart (WTN & Revenue)</label>
            </div>
            <div class="checkbox-item" style="margin-bottom: 4px;">
                <input type="radio" name="chart_type_radio" id="chart-type-pie" value="pie" onchange="updateFrnView()">
                <label for="chart-type-pie">Pie Chart (WTN Count)</label>
            </div>
            <div class="checkbox-item">
                <input type="radio" name="chart_type_radio" id="chart-type-waterfall" value="waterfall" onchange="updateFrnView()">
                <label for="chart-type-waterfall">Waterfall Chart</label>
            </div>
            <hr style="margin: 15px 0; border-top: 1px solid #ddd;">
        `;

        container.innerHTML += `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Main Chart Grouping</p>`;
        chartCols.forEach((colObj, index) => {
            const isChecked = index === 0 ? 'checked' : '';
            container.innerHTML += `
                <div class="checkbox-item">
                    <input type="radio" name="chart_group_radio" id="col-frn-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateFrnView()">
                    <label for="col-frn-${colObj.id}">${colObj.label}</label>
                </div>`;
        });

        container.innerHTML += `<hr style="margin: 15px 0; border-top: 1px solid #ddd;">`;
        container.innerHTML += `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Scatter Plot Grouping</p>`;
        scatterCols.forEach((colObj, index) => {
            const isChecked = index === 0 ? 'checked' : '';
            container.innerHTML += `
                <div class="checkbox-item">
                    <input type="radio" name="scatter_group_radio" id="col-frn-scatter-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateFrnView()">
                    <label for="col-frn-scatter-${colObj.id}">${colObj.label}</label>
                </div>`;
        });

        if (mapOptionsContainer) {
            mapOptionsContainer.innerHTML = `<hr style="margin: 15px 0; border-top: 1px solid #ddd;">`;
            mapOptionsContainer.innerHTML += `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Map View Style</p>`;
            mapCols.forEach((colObj, index) => {
                const isChecked = index === 0 ? 'checked' : '';
                mapOptionsContainer.innerHTML += `
                    <div class="checkbox-item">
                        <input type="radio" name="map_view_radio" id="col-frn-map-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateFrnView()">
                        <label for="col-frn-map-${colObj.id}">${colObj.label}</label>
                    </div>`;
            });
        }

        if (evt) updateFrnView();

    } else if (viewName === 'ai_view') {
        if (aiContainer) aiContainer.style.display = 'block';
        document.getElementById('frn-current-view-name-sidebar').textContent = 'AI Strategy Parameters';
        document.getElementById('frn-column-list').innerHTML = '<p class="text-sm text-gray-600 italic" style="padding:10px;">No columns to select for AI View. Adjust your filters above to refine the strategy.</p>';
        generatePmoHitList();
    }
}


function updateFrnUI(data) {
    const statsContainer = document.getElementById('frn-summary-cards');
    const controlsDiv = document.getElementById('frn-controls');
    const downloadWarning = document.getElementById('frn-download-warning');

    if (data.stats && statsContainer) {
        const stats = data.stats;
        // --- Update Max Load Date ---
        const maxLoadSpan = document.getElementById('frn-max-load-date-display');
        if (maxLoadSpan && stats.max_load_date) {
            maxLoadSpan.textContent = stats.max_load_date;
        }
        // --------------------------------------
        statsContainer.innerHTML = `
            <div class="stat-card total-card"><h4>Total WTNs</h4><p>${stats.total_wtns || '0'}</p></div>
            <div class="stat-card"><h4>Wire Centers</h4><p>${stats.total_wire_centers || '0'}</p></div>
            <div class="stat-card"><h4>Total MRC</h4><p>${stats.total_mrc || '$0'}</p></div>
            <div class="stat-card"><h4>Average MRC</h4><p>${stats.avg_mrc || '$0.00'}</p></div>
            <div class="stat-card"><h4>Fiber Ready WTNs</h4><p>${stats.fiber_ready || '0'}</p></div>
        `;
    }

    const filteredCountSpan = document.getElementById('frn-filtered-count');
    const filteredCount = data.filtered_count || 0;
    if (filteredCountSpan) filteredCountSpan.textContent = filteredCount.toLocaleString();

    const MAX_DOWNLOAD_ROWS = 20000000;
    if (controlsDiv) {
        // --- Bypass the row limit warning if viewing the aggregated Pivot Table ---
        if (frnCurrentView === 'pivot_view') {
            controlsDiv.style.display = 'flex';
            if (downloadWarning) downloadWarning.style.display = 'none';
        } else {
            // Apply normal limits to the Raw Data tab
            if (filteredCount > MAX_DOWNLOAD_ROWS) {
                controlsDiv.style.display = 'none';
                if (downloadWarning) downloadWarning.style.display = 'block';
            } else if (filteredCount > 0) {
                controlsDiv.style.display = 'flex';
                if (downloadWarning) downloadWarning.style.display = 'none';
            } else {
                controlsDiv.style.display = 'none';
                if (downloadWarning) downloadWarning.style.display = 'none';
            }
        }
    }

    if (data.detail_table_html) {
        const detailContainer = document.getElementById('frn-data-container');
        if (detailContainer) {
            detailContainer.innerHTML = data.detail_table_html;
            addTooltipsToTruncatedCells(detailContainer);
        }
    }

    if (data.pivot_table_html) {
        const pivotContainer = document.getElementById('frn-pivot-container');
        if (pivotContainer) {
            pivotContainer.innerHTML = data.pivot_table_html;
            addTooltipsToTruncatedCells(pivotContainer);
            if (frnCurrentView === 'pivot_view') {
                makeFrnPivotCllisClickable(pivotContainer);
            }
        }
    }

    if (data.chart_data || data.waterfall_data) {
        const chartTypeRadio = document.querySelector('input[name="chart_type_radio"]:checked');
        const selectedChartType = chartTypeRadio ? chartTypeRadio.value : 'bar';
        renderFrnChart(data.chart_data, data.chart_group_col, selectedChartType, data.waterfall_data);
    }

    if (data.scatter_data) {
        renderFrnScatterChart(data.scatter_data, data.scatter_group_col);
    }

    if (data.map_data) {
        const mapRadio = document.querySelector('input[name="map_view_radio"]:checked');
        const mapViewType = mapRadio ? mapRadio.value : 'state';
        renderFrnMap(data.map_data, mapViewType);
    }
    // Force Plotly to recalculate its dimensions after drawing so it fits the CSS!
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

function renderFrnScatterChart(scatterDataArray, scatterGroupCol = 'WIRE_CENTER_CLLI') {
    const mapDiv = document.getElementById('frnScatterChart');
    if (!mapDiv) return;

    if (!scatterDataArray || scatterDataArray.length === 0) {
        Plotly.purge(mapDiv);
        return;
    }

    const isStateView = scatterGroupCol === 'STATE';
    const labelName = isStateView ? 'States' : 'Wire Centers';

    const xValues = scatterDataArray.map(item => item.WTN != null ? item.WTN : 0);
    const yValues = scatterDataArray.map(item => item.MRC != null ? item.MRC : 0);
    const ids = scatterDataArray.map(item => item.SCATTER_ID || 'Unknown');
    const states = scatterDataArray.map(item => item.STATE || '');

    const hoverText = scatterDataArray.map((item, i) => {
        let text = isStateView ? `<b>State:</b> ${ids[i]}<br>` : `<b>State:</b> ${states[i]}<br><b>Wire Center:</b> ${ids[i]}<br>`;
        text += `<b>WTNs:</b> ${xValues[i].toLocaleString()}<br>`;
        text += `<b>Revenue:</b> $${yValues[i].toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        return text;
    });

    const trace = {
        x: xValues,
        y: yValues,
        mode: 'markers',
        type: 'scatter',
        customdata: ids,
        text: hoverText,
        hoverinfo: 'text',
        marker: {
            size: 10,
            color: 'rgba(238, 0, 30, 0.6)',
            line: {color: 'rgba(238, 0, 30, 1)', width: 1}
        }
    };

    const layout = {
        title: {text: `Anomaly Finder: Revenue vs. Circuit Count by ${labelName}`, font: {size: 16}},
        hovermode: 'closest',
        dragmode: 'select',
        // Force the axes to anchor at 0
        xaxis: {title: 'Number of Circuits (WTN)', zeroline: false, rangemode: 'tozero'},
        yaxis: {title: 'Total Revenue (MRC)', tickprefix: '$', zeroline: false, rangemode: 'tozero'},
        margin: {l: 100, r: 50, t: 70, b: 80},
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    Plotly.newPlot(mapDiv, [trace], layout, {responsive: true, displayModeBar: false});

    mapDiv.removeAllListeners('plotly_selected');
    mapDiv.on('plotly_selected', function (eventData) {
        if (eventData && eventData.points && eventData.points.length > 0) {
            const selectedIds = eventData.points.map(pt => pt.customdata);
            const filterKey = isStateView ? 'STATE' : 'WIRE_CENTER_CLLI';
            frnClickFilter[filterKey] = selectedIds;
            showToast(`Filtered to ${selectedIds.length} selected ${labelName}`);

            const dataTabButton = document.querySelector('#frnRun .sub-nav-tab[onclick*="data_view"]');
            if (dataTabButton) dataTabButton.click();
            updateFrnView();
        }
    });

    mapDiv.removeAllListeners('plotly_deselect');
    mapDiv.on('plotly_deselect', function () {
        const filterKey = isStateView ? 'STATE' : 'WIRE_CENTER_CLLI';
        delete frnClickFilter[filterKey];
        showToast('Scatter Plot selection cleared.');
        updateFrnView();
    });
}

function renderFrnMap(mapDataArray, mapViewType = 'state') {
    const mapDiv = document.getElementById('frnMap');
    if (!mapDiv) return;

    if (!mapDataArray || mapDataArray.length === 0) {
        mapDiv.innerHTML = '<p style="text-align:center; padding-top: 50px; color:#666; font-style:italic;">No map data available for the current filters.</p>';
        return;
    }

    if (mapViewType === 'geo' && mapDataArray[0].LAT === undefined && mapDataArray[0].LATITUDE === undefined) {
        showToast("Coordinate data not found or invalid. Showing State map instead.", "error");
        mapViewType = 'state';
        const stateRadio = document.getElementById('col-frn-map-state');
        if (stateRadio) stateRadio.checked = true;
    }

    const layout = {
        geo: {
            scope: 'usa',
            projection: {type: 'albers usa'},
            showlakes: true,
            lakecolor: 'rgba(255, 255, 255, 0.5)',
            bgcolor: 'transparent',
            showland: true,
            landcolor: '#e5e7eb',
            subunitcolor: '#ffffff',
            countrycolor: '#ffffff',
            showsubunits: true
        },
        margin: {t: 10, b: 10, l: 10, r: 10},
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent'
    };

    let data = [];

    if (mapViewType === 'state') {
        const states = mapDataArray.map(item => item.STATE);
        const counts = mapDataArray.map(item => item.WTN != null ? item.WTN : 0);
        const hoverText = states.map((state, i) => `${state}<br>WTN Count: ${counts[i].toLocaleString()}`);

        data = [{
            type: 'choropleth',
            locationmode: 'USA-states',
            locations: states,
            z: counts,
            text: hoverText,
            hoverinfo: 'text',
            colorscale: [[0, '#ffe6e6'], [1, '#ee001e']],
            colorbar: {title: 'WTNs', thickness: 15},
            marker: {line: {color: 'rgb(255,255,255)', width: 1}}
        }];
    } else {
        const lats = mapDataArray.map(item => item.LAT !== undefined ? item.LAT : item.LATITUDE);
        const lons = mapDataArray.map(item => item.LON !== undefined ? item.LON : item.LONGITUDE);

        const hoverText = mapDataArray.map(item => {
            const wtn = item.WTN != null ? item.WTN : 0;
            const mrc = item.MRC != null ? item.MRC : 0;
            let mrcText = item.MRC != null ? `<br>Revenue: $${mrc.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '';
            return `<b>${item.CLLI} (${item.STATE})</b><br>WTNs: ${wtn.toLocaleString()}${mrcText}`;
        });

        const sizes = mapDataArray.map(item => {
            const wtn = item.WTN != null ? item.WTN : 0;
            return Math.min(Math.max(Math.sqrt(wtn) * 2.5, 6), 35);
        });

        data = [{
            type: 'scattergeo',
            locationmode: 'USA-states',
            lat: lats,
            lon: lons,
            customdata: mapDataArray.map(item => item.CLLI),
            text: hoverText,
            hoverinfo: 'text',
            marker: {
                size: sizes,
                color: 'rgba(238, 0, 30, 0.7)',
                line: {color: 'rgba(238, 0, 30, 1)', width: 1}
            }
        }];
    }

    Plotly.purge(mapDiv);
    Plotly.newPlot(mapDiv, data, layout, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d']
    });

    mapDiv.on('plotly_click', function (eventData) {
        if (eventData.points && eventData.points.length > 0) {
            if (mapViewType === 'state') {
                const clickedState = eventData.points[0].location;
                frnClickFilter['STATE'] = [clickedState];
                showToast(`Filtering to State: ${clickedState}`);
                updateFrnView();
            } else {
                const clickedClli = eventData.points[0].customdata;
                filterFrnToClli(clickedClli);
            }
        }
    });
}

function renderFrnChart(chartDataArray, groupCol = 'Category', chartType = 'bar', waterfallData = null) {
    const canvas = document.getElementById('frnChart');
    const plotlyDiv = document.getElementById('frnPlotlyChart');

    if (!canvas || !plotlyDiv) return;

    const ctx = canvas.getContext('2d');
    if (frnChartInstance) frnChartInstance.destroy();
    Plotly.purge(plotlyDiv);

    const handleChartClick = (e, activeEls) => {
        if (activeEls.length > 0) {
            const dataIndex = activeEls[0].index;
            const clickedValue = frnChartInstance.data.labels[dataIndex];
            frnClickFilter[groupCol] = [clickedValue];
            showToast(`Filtering by ${groupCol.replace(/_/g, ' ')}: ${clickedValue}`);
            updateFrnView();
        }
    };

    if (chartType === 'waterfall') {
        canvas.style.display = 'none';
        plotlyDiv.style.display = 'block';

        if (!waterfallData || !waterfallData.labels) {
            plotlyDiv.innerHTML = '<p style="text-align:center; padding-top:100px; color:#666; font-style:italic;">Waterfall data unavailable.</p>';
            return;
        }

        // --- RESTORED: STACKED BAR WATERFALL HACK ---
        const labels = waterfallData.labels;
        const absValues = waterfallData.values.map(v => Math.abs(v));

        let currentBase = absValues[0];
        const baseValues = [];
        for (let i = 0; i < absValues.length; i++) {
            if (i === 0) {
                baseValues.push(0);
            } else {
                currentBase -= absValues[i];
                baseValues.push(currentBase);
            }
        }

        let currentY = absValues[0];
        const customAnnotations = absValues.map((v, i) => {
            const wcVal = v.toLocaleString();
            const wtnVal = waterfallData.secondary_counts ? waterfallData.secondary_counts[i].toLocaleString() : '0';
            const labelText = `WCs: <b>${wcVal}</b><br>WTNs: ${wtnVal}`;

            let yPos = currentY;
            if (i > 0) {
                currentY -= v;
            }

            return {
                x: labels[i],
                y: yPos,
                text: labelText,
                font: {size: 12, color: '#333'},
                showarrow: false,
                yanchor: 'bottom',
                yshift: 8,
                align: 'center'
            };
        });

        const shapes = [];
        for (let i = 0; i < labels.length - 1; i++) {
            shapes.push({
                type: 'line',
                x0: i,
                x1: i + 1,
                y0: customAnnotations[i + 1].y,
                y1: customAnnotations[i + 1].y,
                line: {color: 'rgba(0,0,0,0.3)', width: 1, dash: 'dot'}
            });
        }

        const baseTrace = {
            x: labels,
            y: baseValues,
            type: 'bar',
            marker: {color: 'rgba(0,0,0,0)'}, // Transparent base
            hoverinfo: 'none',
            showlegend: false
        };

        const visibleTrace = {
            x: labels,
            y: absValues,
            type: 'bar',
            marker: {
                // YOUR CUSTOM COLORS RESTORED!
                color: ["#000000", "#EE001E", "#0066cc", "#0066cc", "#0066cc", "#0066cc"],
                line: {color: 'rgba(0,0,0,0.1)', width: 1}
            },
            hoverinfo: "x+y",
            showlegend: false
        };

        const data = [baseTrace, visibleTrace];

        const layout = {
            title: {text: `Circuit & Wire Center Count Waterfall`, font: {size: 16}},
            barmode: 'stack',
            xaxis: {type: "category", tickangle: -15},
            yaxis: {title: "Wire Center Count"},
            margin: {t: 80, b: 120, l: 80, r: 20},
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            annotations: customAnnotations,
            shapes: shapes
        };

        Plotly.newPlot(plotlyDiv, data, layout, {responsive: true, displayModeBar: false});

        plotlyDiv.removeAllListeners('plotly_click');
        plotlyDiv.on('plotly_click', function (eventData) {
            if (eventData.points && eventData.points.length > 0) {
                const clickedBucket = eventData.points[0].x;

                if (clickedBucket === 'Total' || clickedBucket === 'Total WTNs') {
                    delete frnClickFilter['WATERFALL_BUCKET'];
                    showToast('Waterfall filter cleared.');
                } else {
                    frnClickFilter['WATERFALL_BUCKET'] = [clickedBucket];
                    showToast(`Filtering to: ${clickedBucket}`);
                }

                const dataTabButton = document.querySelector('#frnRun .sub-nav-tab[onclick*="data_view"]');
                if (dataTabButton) {
                    dataTabButton.click();
                } else {
                    updateFrnView();
                }
            }
        });

    } else {
        canvas.style.display = 'block';
        plotlyDiv.style.display = 'none';

        if (!chartDataArray || chartDataArray.length === 0) return;

        const labels = chartDataArray.map(item => item.LABEL || 'Unknown');
        const wtnValues = chartDataArray.map(item => item.WTN || 0);
        const mrcValues = chartDataArray.map(item => item.MRC || 0);

        if (chartType === 'pie') {
            const pieColors = ['#EE001E', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4', '#6A4C93'];
            frnChartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{data: wtnValues, backgroundColor: pieColors.slice(0, labels.length), hoverOffset: 10}]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, onClick: handleChartClick,
                    onHover: (event, chartElement) => {
                        event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                    },
                    plugins: {
                        title: {display: true, text: `WTN Count by ${groupCol.replace(/_/g, ' ')}`, font: {size: 16}},
                        legend: {position: 'right'},
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return ` ${context.label}: ${context.parsed.toLocaleString()} WTNs`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            frnChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'WTN Count',
                            data: wtnValues,
                            backgroundColor: 'rgba(238, 0, 30, 0.7)',
                            borderColor: 'rgba(238, 0, 30, 1)',
                            borderWidth: 1,
                            borderRadius: 4,
                            yAxisID: 'y'
                        },
                        {
                            type: 'line',
                            label: 'Total Revenue (MRC)',
                            data: mrcValues,
                            backgroundColor: 'rgba(54, 162, 235, 1)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 3,
                            pointBackgroundColor: 'rgba(54, 162, 235, 1)',
                            pointRadius: 4,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, onClick: handleChartClick,
                    onHover: (event, chartElement) => {
                        event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                    },
                    plugins: {
                        legend: {display: true, position: 'top'},
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) {
                                        if (context.datasetIndex === 1) label += '$' + context.parsed.y.toLocaleString(undefined, {minimumFractionDigits: 2});
                                        else label += context.parsed.y.toLocaleString();
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {display: true, text: 'WTN Count'},
                            grid: {drawOnChartArea: true}
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {display: true, text: 'Revenue ($)'},
                            grid: {drawOnChartArea: false}
                        },
                        x: {title: {display: true, text: groupCol.replace(/_/g, ' ')}}
                    }
                }
            });
        }
    }
}

function addTooltipsToTruncatedCells(container) {
    if (!container) return;
    const cells = container.querySelectorAll('td');
    cells.forEach(cell => {
        if (cell.textContent.trim().length > 15) {
            cell.setAttribute('title', cell.textContent.trim());
        }
    });
}

async function generatePmoHitList() {
    const container = document.getElementById('pmo-hitlist-container');
    const loadingDiv = document.getElementById('frn-loading');

    if (loadingDiv) loadingDiv.style.display = 'block';
    container.innerHTML = '<p style="color: #666; font-style: italic; font-size: 16px; text-align: center; margin-top: 30px;">Evaluating Leadership Priorities vs. Footprint Density...</p>';

    try {
        const response = await fetch('/frn-generate-hitlist', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filters: lastAppliedFrnFilters})
        });
        const data = await response.json();

        if (data.status === 'success') {
            container.innerHTML = data.hitlist_html;
        } else {
            container.innerHTML = `<span style="color:red; font-weight:bold;">Error: ${data.message}</span>`;
        }
    } catch (e) {
        container.innerHTML = `<span style="color:red; font-weight:bold;">Error generating AI Strategy. Check console.</span>`;
        console.error("AI Strategy Error: ", e);
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}




function makeFrnPivotCllisClickable(container) {
    const headers = container.querySelectorAll('th');
    let clliColumnIndex = -1;

    headers.forEach((th, index) => {
        const headerText = th.textContent.trim().toUpperCase().replace(/ /g, '_');
        // Added CLLI_CLEAN so it catches the new DuckDB column name
        if (headerText === 'WIRE_CENTER_CLLI' || headerText === 'CLLI' || headerText === 'CLLI_CLEAN') {
            clliColumnIndex = index;
        }
    });

    if (clliColumnIndex === -1) return;

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cell = row.cells[clliColumnIndex];
        if (cell) {
            const clliValue = cell.textContent.trim();
            if (clliValue !== '') {
                cell.classList.add('clickable-clli');
                cell.style.color = '#0066cc';
                cell.style.cursor = 'pointer';
                cell.style.textDecoration = 'underline';
                cell.onclick = () => filterFrnToClli(clliValue);
            }
        }
    });
}

function filterFrnToClli(clliValue) {
    frnClickFilter['WIRE_CENTER_CLLI'] = [clliValue];
    showToast(`Filtering to Wire Center: ${clliValue}`);
    frnChoicesInstances.forEach(instance => instance.removeActiveItems());

    const dataTabButton = document.querySelector('#frnRun .sub-nav-tab[onclick*="data_view"]');
    if (dataTabButton) {
        dataTabButton.click();
    } else {
        updateFrnView();
    }
}



function downloadFrnData(format) {
    const checkboxes = document.querySelectorAll('#frn-column-list input[type="checkbox"]:checked');
    let selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        selectedColumns = frnAllColumns[frnCurrentView];
    }

    const params = new URLSearchParams({
        format: format,
        view: frnCurrentView,
        columns: selectedColumns.join(',')
    });

    for (const columnKey in lastAppliedFrnFilters) {
        const values = Array.isArray(lastAppliedFrnFilters[columnKey])
            ? lastAppliedFrnFilters[columnKey]
            : [lastAppliedFrnFilters[columnKey]];

        values.forEach(value => {
            params.append(`filter_${columnKey}`, value);
        });
    }

    const downloadUrl = `/download_frn_data?${params.toString()}`;
    window.location.href = downloadUrl;
    showToast(`Starting FRN ${format.toUpperCase()} download...`, 'success');
}

function downloadFrnChartSpecific(chartType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (chartType === 'main') {
        const plotlyChart = document.getElementById('frnPlotlyChart');
        const canvasChart = document.getElementById('frnChart');

        if (plotlyChart && plotlyChart.style.display !== 'none' && plotlyChart.data) {
            Plotly.downloadImage(plotlyChart, {
                format: 'png',
                width: 1200,
                height: 600,
                filename: `FRN_Waterfall_${timestamp}.png`
            })
                .then(() => showToast('Waterfall Chart downloaded.', 'success'))
                .catch(() => showToast('Error downloading Plotly chart.', 'error'));
        } else if (canvasChart && canvasChart.style.display !== 'none' && frnChartInstance) {
            const link = document.createElement('a');
            link.href = frnChartInstance.toBase64Image();
            link.download = `FRN_MainChart_${timestamp}.png`;
            link.click();
            showToast('Standard Chart downloaded.', 'success');
        } else {
            showToast('Main chart not visible or loading.', 'warning');
        }
    } else if (chartType === 'scatter') {
        const scatterDiv = document.getElementById('frnScatterChart');
        if (scatterDiv && scatterDiv.data) {
            Plotly.downloadImage(scatterDiv, {
                format: 'png',
                width: 1200,
                height: 600,
                filename: `FRN_Scatter_${timestamp}.png`
            })
                .then(() => showToast('Scatter plot downloaded.', 'success'))
                .catch(() => showToast('Error downloading Scatter plot.', 'error'));
        } else {
            showToast('Scatter plot not visible.', 'warning');
        }
    }
}


// ==========================================================================
// Cheetah (NFOD) Tool Functions
// ==========================================================================

const CHEETAH_PIVOT_COLUMNS_DEFAULT = ['STATE', 'CLLI', 'SERVICE_TYPE', 'SOURCE', 'PRIORITY_WAVE'];
const CHEETAH_DETAIL_COLUMNS_DEFAULT = ['COMPRESSED_CIRCUIT_ID', 'CKT_WTN', 'CLLI','LOCA_CLLI','LOCZ_CLLI', 'WTN', 'STATE', 'CITY', 'SERVICE_TYPE', 'SOURCE', 'PRIORITY_WAVE'];

async function initializeCheetahTool() {
    isCheetahInitialized = true;
    const loadingDiv = document.getElementById('cheetah-loading');
    const filtersContainer = document.getElementById('cheetah-filters-container');
    const colContainer = document.getElementById('cheetah-column-list');

    if (loadingDiv) loadingDiv.style.display = 'block';

    try {
        const response = await fetch('/cheetah');
        const data = await response.json();

        if (data.status === 'success') {
            cheetahAllColumns['pivot_view'] = data.pivot_all_columns || CHEETAH_PIVOT_COLUMNS_DEFAULT;
            cheetahDefaultColumns['pivot_view'] = data.pivot_all_columns || CHEETAH_PIVOT_COLUMNS_DEFAULT;
            cheetahAllColumns['data_view'] = data.detail_all_columns || CHEETAH_DETAIL_COLUMNS_DEFAULT;
            cheetahDefaultColumns['data_view'] = data.detail_default_columns || CHEETAH_DETAIL_COLUMNS_DEFAULT;

            // Populate Filters
            if (filtersContainer && data.filter_options) {
                filtersContainer.innerHTML = '';
                for (const column in data.filter_options) {
                    const options = data.filter_options[column];
                    let filtersHtml = `<div class="filter-item flex flex-col" style="margin-bottom: 10px;">
                        <label class="mb-1 text-sm font-medium text-gray-700">${column.replace(/_/g, ' ')}</label>
                        <select data-column="${column}" multiple class="cheetah-filter w-full">`;
                    options.forEach(option => {
                        filtersHtml += `<option value="${option}">${option}</option>`;
                    });
                    filtersHtml += `</select></div>`;
                    filtersContainer.innerHTML += filtersHtml;
                }

                document.querySelectorAll('.cheetah-filter').forEach(filter => {
                    if (typeof Choices !== 'undefined') {
                        cheetahChoicesInstances.push(new Choices(filter, {removeItemButton: true, itemSelectText: ''}));
                    }
                });
            }

            if (colContainer) {
                populateCheetahColumnSelector(cheetahAllColumns[cheetahCurrentView], cheetahDefaultColumns[cheetahCurrentView]);
            }

            updateCheetahUI(data);

            // Event Listeners
            document.getElementById('cheetah-apply-filters-btn').addEventListener('click', updateCheetahView);
            document.getElementById('cheetah-update-view-btn').addEventListener('click', updateCheetahView);
            document.getElementById('cheetah-reset-filters-btn').addEventListener('click', () => {
                cheetahChoicesInstances.forEach(instance => instance.removeActiveItems());
                cheetahClickFilter = {};
                updateCheetahView();
            });

        } else {
            showToast(data.message || 'Error loading Cheetah data.', 'error');
        }
    } catch (error) {
        showToast('Failed to load Cheetah tool.', 'error');
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

function switchCheetahView(evt, viewName) {
    document.querySelectorAll('#cheetahRun .sub-nav-tab').forEach(button => button.classList.remove('active'));
    if (evt) evt.currentTarget.classList.add('active');

    document.getElementById('cheetah-data-container').style.display = 'none';
    document.getElementById('cheetah-pivot-container').style.display = 'none';
    document.getElementById('cheetah-chart-container').style.display = 'none';
    const mapOptionsContainer = document.getElementById('cheetah-map-options-container');
    if (mapOptionsContainer) mapOptionsContainer.innerHTML = '';

    cheetahCurrentView = viewName;

    const btnCsv = document.getElementById('cheetah-btn-download-csv');
    const btnExcel = document.getElementById('cheetah-btn-download-excel');
    const imgGroup = document.getElementById('cheetah-btn-download-image-group');

    if (viewName === 'chart_view') {
        if (btnCsv) btnCsv.style.display = 'none';
        if (btnExcel) btnExcel.style.display = 'none';
        if (imgGroup) {
            imgGroup.style.display = 'flex';
            document.getElementById('cheetah-controls').style.display = 'flex';
        }
    } else {
        if (btnCsv) btnCsv.style.display = 'flex';
        if (btnExcel) btnExcel.style.display = 'flex';
        if (imgGroup) imgGroup.style.display = 'none';
    }

    if (viewName === 'data_view') {
        document.getElementById('cheetah-data-container').style.display = 'block';
        document.getElementById('cheetah-current-view-name-sidebar').textContent = 'Select Columns (Raw Data)';
        populateCheetahColumnSelector(cheetahAllColumns['data_view'], cheetahDefaultColumns['data_view']);
        if (evt) updateCheetahView();

    } else if (viewName === 'pivot_view') {
        document.getElementById('cheetah-pivot-container').style.display = 'block';
        document.getElementById('cheetah-current-view-name-sidebar').textContent = 'Select Grouping (Pivot)';
        populateCheetahColumnSelector(cheetahAllColumns['pivot_view'], cheetahDefaultColumns['pivot_view']);
        if (evt) updateCheetahView();

    } else if (viewName === 'chart_view') {
        document.getElementById('cheetah-chart-container').style.display = 'block';
        document.getElementById('cheetah-current-view-name-sidebar').textContent = 'Select Chart Grouping';

        const chartCols = [
            {id: 'SERVICE_TYPE', label: 'Group By: Service Type'},
            {id: 'SOURCE', label: 'Group By: Source'},
            {id: 'PRIORITY_WAVE', label: 'Group By: Priority Wave'},
            {id: 'CIRCUIT_RATE_GROUP', label: 'Group By: Rate Group'}
        ];

        const scatterCols = [
            {id: 'CLLI', label: 'Scatter Plot: Wire Centers'},
            {id: 'STATE', label: 'Scatter Plot: States'}
        ];

        const mapCols = [
            {id: 'state', label: 'Map: State Density'},
            {id: 'geo', label: 'Map: Pinpoint Locations (Lat/Lon)'},
            {id: 'az_lines', label: 'Map: A to Z Network Lines'}
        ];

        const container = document.getElementById('cheetah-column-list');
        container.innerHTML = `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Chart Type</p>
            <div class="checkbox-item" style="margin-bottom: 4px;">
                <input type="radio" name="cheetah_chart_type_radio" id="cheetah-chart-bar" value="bar" checked onchange="updateCheetahView()">
                <label for="cheetah-chart-bar">Bar Chart</label>
            </div>
            <div class="checkbox-item" style="margin-bottom: 4px;">
                <input type="radio" name="cheetah_chart_type_radio" id="cheetah-chart-pie" value="pie" onchange="updateCheetahView()">
                <label for="cheetah-chart-pie">Pie Chart</label>
            </div>
            <hr style="margin: 15px 0; border-top: 1px solid #ddd;">`;

        container.innerHTML += `<p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Main Chart Grouping</p>`;
        chartCols.forEach((colObj, index) => {
            const isChecked = index === 0 ? 'checked' : '';
            container.innerHTML += `
                <div class="checkbox-item">
                    <input type="radio" name="cheetah_chart_group_radio" id="col-cheetah-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateCheetahView()">
                    <label for="col-cheetah-${colObj.id}">${colObj.label}</label>
                </div>`;
        });

        container.innerHTML += `<hr style="margin: 15px 0; border-top: 1px solid #ddd;">
            <p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Scatter Plot Grouping</p>`;
        scatterCols.forEach((colObj, index) => {
            const isChecked = index === 0 ? 'checked' : '';
            container.innerHTML += `
                <div class="checkbox-item">
                    <input type="radio" name="cheetah_scatter_group_radio" id="col-cheetah-scatter-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateCheetahView()">
                    <label for="col-cheetah-scatter-${colObj.id}">${colObj.label}</label>
                </div>`;
        });

        if (mapOptionsContainer) {
            mapOptionsContainer.innerHTML = `<hr style="margin: 15px 0; border-top: 1px solid #ddd;">
                <p class="text-sm font-bold text-gray-700 mb-1" style="margin-bottom: 8px;">Map View Style</p>`;
            mapCols.forEach((colObj, index) => {
                const isChecked = index === 0 ? 'checked' : '';
                mapOptionsContainer.innerHTML += `
                    <div class="checkbox-item">
                        <input type="radio" name="cheetah_map_view_radio" id="col-cheetah-map-${colObj.id}" value="${colObj.id}" ${isChecked} onchange="updateCheetahView()">
                        <label for="col-cheetah-map-${colObj.id}">${colObj.label}</label>
                    </div>`;
            });
        }
        if (evt) updateCheetahView();
    }
}

async function updateCheetahView() {
    const loadingDiv = document.getElementById('cheetah-loading');
    if (loadingDiv) loadingDiv.style.display = 'block';

    const checkboxes = document.querySelectorAll('#cheetah-column-list input[type="checkbox"]:checked');
    let selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        selectedColumns = cheetahDefaultColumns[cheetahCurrentView] || [];
    }

    const chartRadio = document.querySelector('input[name="cheetah_chart_group_radio"]:checked');
    let chartGroupCol = chartRadio ? chartRadio.value : 'SERVICE_TYPE';

    const scatterRadio = document.querySelector('input[name="cheetah_scatter_group_radio"]:checked');
    let scatterGroupCol = scatterRadio ? scatterRadio.value : 'CLLI';

    const mapRadio = document.querySelector('input[name="cheetah_map_view_radio"]:checked');
    let mapViewType = mapRadio ? mapRadio.value : 'state';

    let filters = {...cheetahClickFilter};
    cheetahChoicesInstances.forEach(instance => {
        const column = instance.passedElement.element.dataset.column;
        const selectedValues = instance.getValue(true)?.filter(value => value !== "") || [];
        if (selectedValues.length > 0) {
            filters[column] = selectedValues;
        }
    });

    lastAppliedCheetahFilters = {...filters};

    try {
        const response = await fetch('/cheetah', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                view: cheetahCurrentView,
                columns: selectedColumns,
                filters: filters,
                chart_group_col: chartGroupCol,
                scatter_group_col: scatterGroupCol,
                map_view_type: mapViewType
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            updateCheetahUI(data);
        } else {
            showToast(data.message, 'error');
        }
    } catch (e) {
        showToast('Unexpected error rendering Cheetah.', 'error');
    } finally {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

function updateCheetahUI(data) {
    const statsContainer = document.getElementById('cheetah-summary-cards');
    const controlsDiv = document.getElementById('cheetah-controls');

    const edwLoadSpan = document.getElementById('cheetah-max-load-date-display');
    if (edwLoadSpan) {
        if (data.stats && data.stats.max_load_date && data.stats.max_load_date !== 'NULL') {
            edwLoadSpan.textContent =  data.stats.max_load_date;
        } else {
            edwLoadSpan.textContent = 'Unknown';
        }
    }

    const fileDateSpan = document.getElementById('cheetah-file-date-display');
    if (fileDateSpan) {
        if (data.stats && data.stats.file_pull_date) {
            fileDateSpan.textContent = data.stats.file_pull_date;
        } else {
            fileDateSpan.textContent = 'Unknown';
        }
    }

    if (data.stats && statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card total-card"><h4>Total CIR WTNs</h4><p>${data.stats.total_cir_wtns}</p></div>
            <div class="stat-card"><h4>Total CIR IDs</h4><p>${data.stats.total_cir_ids}</p></div>
            <div class="stat-card"><h4>Total Raw WTNs</h4><p>${data.stats.total_raw_wtns}</p></div>
            <div class="stat-card"><h4>Wire Centers</h4><p>${data.stats.total_wire_centers}</p></div>
            <div class="stat-card total-card"><h4>Avg Cost to Achieve</h4><p>${data.stats.avg_cta}</p></div>
        `;
    }

    const countSpan = document.getElementById('cheetah-filtered-count');
    const filteredCount = data.filtered_count || 0;
    if (countSpan) countSpan.textContent = filteredCount.toLocaleString();

    if (controlsDiv) {
        controlsDiv.style.display = filteredCount > 0 ? 'flex' : 'none';
    }

    if (data.detail_table_html) {
        const detailContainer = document.getElementById('cheetah-data-container');
        if (detailContainer) {
            detailContainer.innerHTML = data.detail_table_html;
            addTooltipsToTruncatedCells(detailContainer);
        }
    }

    if (data.pivot_table_html) {
        const pivotContainer = document.getElementById('cheetah-pivot-container');
        if (pivotContainer) {
            pivotContainer.innerHTML = data.pivot_table_html;
            addTooltipsToTruncatedCells(pivotContainer);
        }
    }

    if (data.chart_data) {
        const chartTypeRadio = document.querySelector('input[name="cheetah_chart_type_radio"]:checked');
        const selectedChartType = chartTypeRadio ? chartTypeRadio.value : 'bar';
        renderCheetahChart(data.chart_data, data.chart_group_col, selectedChartType);
    }

    if (data.scatter_data) {
        renderCheetahScatterChart(data.scatter_data, data.scatter_group_col);
    }

    if (data.map_data) {
        const mapRadio = document.querySelector('input[name="cheetah_map_view_radio"]:checked');
        const mapViewType = mapRadio ? mapRadio.value : 'state';
        renderCheetahMap(data.map_data, mapViewType);
    }

    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

function renderCheetahScatterChart(scatterDataArray, scatterGroupCol = 'CLLI') {
    const mapDiv = document.getElementById('cheetahScatterChart');
    if (!mapDiv) return;

    if (!scatterDataArray || scatterDataArray.length === 0) {
        Plotly.purge(mapDiv);
        return;
    }

    const isStateView = scatterGroupCol === 'STATE';
    const labelName = isStateView ? 'States' : 'Wire Centers';

    const xValues = scatterDataArray.map(item => item.WTN != null ? item.WTN : 0);
    const yValues = scatterDataArray.map(item => item.RAW_WTN != null ? item.RAW_WTN : 0);
    const ids = scatterDataArray.map(item => item.SCATTER_ID || 'Unknown');
    const states = scatterDataArray.map(item => item.STATE || '');

    const hoverText = scatterDataArray.map((item, i) => {
        let text = isStateView ? `<b>State:</b> ${ids[i]}<br>` : `<b>State:</b> ${states[i]}<br><b>Wire Center:</b> ${ids[i]}<br>`;
        text += `<b>CIR IDs:</b> ${xValues[i].toLocaleString()}<br>`;
        text += `<b>CIR WTNs:</b> ${yValues[i].toLocaleString()}`;
        return text;
    });

    const trace = {
        x: xValues, y: yValues, mode: 'markers', type: 'scatter', customdata: ids, text: hoverText, hoverinfo: 'text',
        marker: {size: 10, color: 'rgba(238, 0, 30, 0.6)', line: {color: 'rgba(238, 0, 30, 1)', width: 1}}
    };

    const layout = {
        title: {text: `Compression Finder: CIR IDs vs CIR WTNs by ${labelName}`, font: {size: 16}},
        hovermode: 'closest', dragmode: 'select',
        xaxis: {title: 'CIR IDs', zeroline: false, rangemode: 'tozero'},
        yaxis: {title: 'CIR WTNs', zeroline: false, rangemode: 'tozero'},
        margin: {l: 100, r: 50, t: 70, b: 80}, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent'
    };

    Plotly.newPlot(mapDiv, [trace], layout, {responsive: true, displayModeBar: false});

    mapDiv.removeAllListeners('plotly_selected');
    mapDiv.on('plotly_selected', function (eventData) {
        if (eventData && eventData.points && eventData.points.length > 0) {
            const selectedIds = eventData.points.map(pt => pt.customdata);
            cheetahClickFilter[scatterGroupCol] = selectedIds;
            showToast(`Filtered to ${selectedIds.length} selected ${labelName}`);
            const dataTabButton = document.querySelector('#cheetahRun .sub-nav-tab[onclick*="data_view"]');
            if (dataTabButton) dataTabButton.click();
            updateCheetahView();
        }
    });

    mapDiv.removeAllListeners('plotly_deselect');
    mapDiv.on('plotly_deselect', function () {
        delete cheetahClickFilter[scatterGroupCol];
        showToast('Scatter Plot selection cleared.');
        updateCheetahView();
    });
}

function renderCheetahMap(mapDataArray, mapViewType = 'state') {
    const mapDiv = document.getElementById('cheetahMap');
    if (!mapDiv) return;

    if (!mapDataArray || mapDataArray.length === 0) {
        mapDiv.innerHTML = '<p style="text-align:center; padding-top: 50px; color:#666; font-style:italic;">No map data available.</p>';
        return;
    }

    const layout = {
        geo: {
            scope: 'usa',
            projection: {type: 'albers usa'},
            showlakes: true,
            lakecolor: 'rgba(255, 255, 255, 0.5)',
            bgcolor: 'transparent',
            showland: true,
            landcolor: '#e5e7eb',
            subunitcolor: '#ffffff',
            countrycolor: '#ffffff',
            showsubunits: true
        },
        margin: {t: 10, b: 10, l: 10, r: 10},
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        showlegend: false
    };

    let data = [];

    if (mapViewType === 'az_lines') {
        let lineLats = [], lineLons = [];
        let midLats = [], midLons = [], hoverTexts = [];
        let nodeMap = new Map(); // Tracks unique A and Z locations

        mapDataArray.forEach(item => {
            if (item.LOCA_LAT && item.LOCA_LON && item.LOCZ_LAT && item.LOCZ_LON) {
                // 1. Plot the lines (with a null separator to prevent scribbling)
                lineLats.push(item.LOCA_LAT, item.LOCZ_LAT, null);
                lineLons.push(item.LOCA_LON, item.LOCZ_LON, null);

                // 2. Plot invisible midpoints to act as the "hover zone"
                midLats.push((item.LOCA_LAT + item.LOCZ_LAT) / 2);
                midLons.push((item.LOCA_LON + item.LOCZ_LON) / 2);
                hoverTexts.push(`<b>Path: ${item.LOCA_CLLI} ➔ ${item.LOCZ_CLLI}</b><br>CIR IDs: ${(item.WTN || 0).toLocaleString()}<br>Raw WTNs: ${(item.RAW_WTN || 0).toLocaleString()}`);

                // 3. Collect unique Wire Center nodes to map as physical dots
                if (!nodeMap.has(item.LOCA_CLLI)) nodeMap.set(item.LOCA_CLLI, {lat: item.LOCA_LAT, lon: item.LOCA_LON});
                if (!nodeMap.has(item.LOCZ_CLLI)) nodeMap.set(item.LOCZ_CLLI, {lat: item.LOCZ_LAT, lon: item.LOCZ_LON});
            }
        });

        let nodeLats = [], nodeLons = [], nodeTexts = [];
        nodeMap.forEach((coords, clli) => {
            nodeLats.push(coords.lat);
            nodeLons.push(coords.lon);
            nodeTexts.push(`<b>Wire Center: ${clli}</b>`);
        });

        data = [
            // Trace 1: The physical lines (Light blue, hover disabled)
            {
                type: 'scattergeo', locationmode: 'USA-states', lat: lineLats, lon: lineLons,
                mode: 'lines', line: {width: 1.5, color: 'rgba(54, 162, 235, 0.6)'}, hoverinfo: 'none'
            },
            // Trace 2: The Anchor Nodes (Small dark dots representing the Wire Centers)
            {
                type: 'scattergeo', locationmode: 'USA-states', lat: nodeLats, lon: nodeLons,
                mode: 'markers', text: nodeTexts, hoverinfo: 'text',
                marker: {size: 4, color: 'rgba(17, 24, 39, 0.8)'}
            },
            // Trace 3: The Invisible Midpoints (Large transparent markers that catch your mouse!)
            {
                type: 'scattergeo', locationmode: 'USA-states', lat: midLats, lon: midLons,
                mode: 'markers', text: hoverTexts, hoverinfo: 'text',
                marker: {size: 14, color: 'rgba(0,0,0,0)'}
            }
        ];

    } else if (mapViewType === 'state') {
        const states = mapDataArray.map(item => item.STATE);
        const counts = mapDataArray.map(item => item.WTN != null ? item.WTN : 0);
        const hoverText = states.map((state, i) => `${state}<br>CIR IDs: ${counts[i].toLocaleString()}`);

        data = [{
            type: 'choropleth',
            locationmode: 'USA-states',
            locations: states,
            z: counts,
            text: hoverText,
            hoverinfo: 'text',
            colorscale: [[0, '#ffe6e6'], [1, '#ee001e']],
            colorbar: {title: 'CIR IDs', thickness: 15},
            marker: {line: {color: 'rgb(255,255,255)', width: 1}}
        }];

    } else {
        const lats = mapDataArray.map(item => item.LAT);
        const lons = mapDataArray.map(item => item.LON);
        const hoverText = mapDataArray.map(item => `<b>${item.CLLI} (${item.STATE})</b><br>CIR IDs: ${item.WTN.toLocaleString()}<br>Raw WTNs: ${item.RAW_WTN.toLocaleString()}`);
        const sizes = mapDataArray.map(item => Math.min(Math.max(Math.sqrt(item.WTN) * 2.5, 6), 35));

        data = [{
            type: 'scattergeo',
            locationmode: 'USA-states',
            lat: lats,
            lon: lons,
            customdata: mapDataArray.map(item => item.CLLI),
            text: hoverText,
            hoverinfo: 'text',
            marker: {size: sizes, color: 'rgba(238, 0, 30, 0.7)', line: {color: 'rgba(238, 0, 30, 1)', width: 1}}
        }];
    }

    Plotly.purge(mapDiv);
    Plotly.newPlot(mapDiv, data, layout, {responsive: true, displayModeBar: true, displaylogo: false});

    mapDiv.on('plotly_click', function (eventData) {
        if (eventData.points && eventData.points.length > 0) {
            if (mapViewType === 'state') {
                const clickedState = eventData.points[0].location;
                cheetahClickFilter['STATE'] = [clickedState];
                showToast(`Filtering to State: ${clickedState}`);
                updateCheetahView();
            } else if (mapViewType === 'geo') {
                const clickedClli = eventData.points[0].customdata;
                cheetahClickFilter['CLLI'] = [clickedClli];
                showToast(`Filtering to Wire Center: ${clickedClli}`);
                const dataTabButton = document.querySelector('#cheetahRun .sub-nav-tab[onclick*="data_view"]');
                if (dataTabButton) dataTabButton.click();
                updateCheetahView();
            }
        }
    });
}

function renderCheetahChart(chartDataArray, groupCol = 'Category', chartType = 'bar') {
    const canvas = document.getElementById('cheetahChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (cheetahChartInstance) cheetahChartInstance.destroy();

    if (!chartDataArray || chartDataArray.length === 0) return;

    const labels = chartDataArray.map(item => item.LABEL || 'Unknown');
    const wtnValues = chartDataArray.map(item => item.WTN || 0);
    const rawWtnValues = chartDataArray.map(item => item.RAW_WTN || 0);

    const handleChartClick = (e, activeEls) => {
        if (activeEls.length > 0) {
            const dataIndex = activeEls[0].index;
            cheetahClickFilter[groupCol] = [labels[dataIndex]];
            showToast(`Filtering by ${groupCol.replace(/_/g, ' ')}: ${labels[dataIndex]}`);
            updateCheetahView();
        }
    };

    if (chartType === 'pie') {
        const pieColors = ['#EE001E', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926'];
        cheetahChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {labels: labels, datasets: [{data: wtnValues, backgroundColor: pieColors, hoverOffset: 10}]},
            options: {
                responsive: true, maintainAspectRatio: false, onClick: handleChartClick,
                plugins: {
                    title: {display: true, text: `CIR ID Count by ${groupCol.replace(/_/g, ' ')}`, font: {size: 16}},
                    legend: {position: 'right'}
                }
            }
        });
    } else {
        cheetahChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'CIR ID Count',
                        data: wtnValues,
                        backgroundColor: 'rgba(238, 0, 30, 0.7)',
                        borderColor: 'rgba(238, 0, 30, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'CIR WTN Count',
                        data: rawWtnValues,
                        backgroundColor: 'rgba(54, 162, 235, 1)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, onClick: handleChartClick,
                plugins: {legend: {display: true, position: 'top'}},
                scales: {
                    y: {type: 'linear', display: true, position: 'left', title: {display: true, text: 'CIR IDs'}},
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {display: true, text: 'CIR WTNs'},
                        grid: {drawOnChartArea: false}
                    },
                    x: {title: {display: true, text: groupCol.replace(/_/g, ' ')}}
                }
            }
        });
    }
}

function populateCheetahColumnSelector(allColumns, defaultColumns) {
    const container = document.getElementById('cheetah-column-list');
    if (!container || !allColumns) return;

    // Clear the container first
    container.innerHTML = '';

    // 1. Inject the Select All / Clear All buttons at the top
    container.innerHTML += `
        <div style="display: flex; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
            <button id="cheetah-select-all-cols" type="button" style="flex: 1; padding: 4px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #f9fafb;">Select All</button>
            <button id="cheetah-deselect-all-cols" type="button" style="flex: 1; padding: 4px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #f9fafb;">Clear All</button>
        </div>`;

    // 2. Render the column checkboxes (adding the 'cheetah-col-cb' class for easy targeting)

    allColumns.forEach(column => {
        const isChecked = defaultColumns.includes(column);
        const cleanLabel = column.replace(/_/g, ' ');
        container.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="col-cheetah-${column}" value="${column}" ${isChecked ? 'checked' : ''}>
                <label for="col-cheetah-${column}">${cleanLabel}</label>
            </div>`;
    });
    // 3. Attach Event Listeners to the new buttons
    document.getElementById('cheetah-select-all-cols').addEventListener('click', () => {
        document.querySelectorAll('#cheetah-column-list .cheetah-col-cb').forEach(cb => cb.checked = true);
    });

    document.getElementById('cheetah-deselect-all-cols').addEventListener('click', () => {
        document.querySelectorAll('#cheetah-column-list .cheetah-col-cb').forEach(cb => cb.checked = false);
    });
}

function downloadCheetahData(format) {
    const checkboxes = document.querySelectorAll('#cheetah-column-list input[type="checkbox"]:checked');
    let selectedColumns = Array.from(checkboxes).map(cb => cb.value);

    if (selectedColumns.length === 0) {
        selectedColumns = cheetahDefaultColumns[cheetahCurrentView] || [];
    }

    const params = new URLSearchParams({
        format: format,
        view: cheetahCurrentView,
        columns: selectedColumns.join(',')
    });

    for (const columnKey in lastAppliedCheetahFilters) {
        const values = Array.isArray(lastAppliedCheetahFilters[columnKey])
            ? lastAppliedCheetahFilters[columnKey]
            : [lastAppliedCheetahFilters[columnKey]];

        values.forEach(value => {
            params.append(`filter_${columnKey}`, value);
        });
    }

    const downloadUrl = `/download_cheetah_data?${params.toString()}`;
    window.location.href = downloadUrl;
    showToast(`Starting NFOD ${format.toUpperCase()} download...`, 'success');
}

function downloadCheetahChartSpecific(chartType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (chartType === 'main' && cheetahChartInstance) {
        const link = document.createElement('a');
        link.href = cheetahChartInstance.toBase64Image();
        link.download = `Cheetah_Chart_${timestamp}.png`;
        link.click();
        showToast('Chart downloaded.', 'success');
    } else if (chartType === 'scatter') {
        const scatterDiv = document.getElementById('cheetahScatterChart');
        if (scatterDiv && scatterDiv.data) {
            Plotly.downloadImage(scatterDiv, {
                format: 'png',
                width: 1200,
                height: 600,
                filename: `Cheetah_Scatter_${timestamp}.png`
            });
            showToast('Scatter plot downloaded.', 'success');
        }
    }
}

// ==========================================================================
// Cheetah Writeback Functions
// ==========================================================================

function setupCheetahWritebackPanel() {
    const submitBtn = document.getElementById('cheetah-submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitCheetahUpdate);
        document.querySelectorAll('input[name="cheetahUpdateMethod"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('panel-cheetah-single').style.display = (e.target.value === 'single') ? 'block' : 'none';
                document.getElementById('panel-cheetah-paste').style.display = (e.target.value === 'paste') ? 'block' : 'none';
            });
        });
    }
}

async function submitCheetahUpdate() {
    const updateMethod = document.querySelector('input[name="cheetahUpdateMethod"]:checked').value;
    let payload = {method: updateMethod};

    if (updateMethod === 'paste') {
        const pastedList = document.getElementById('cheetah-paste-list').value.trim();
        if (!pastedList) {
            showToast('Please paste data.', 'error');
            return;
        }

        const records = pastedList.split('\n').map((row, index) => {
            const cols = row.split('\t');

            // Ensure we at least have the primary key (CKT_WTN)
            if (!cols[0] || !cols[0].trim()) return null;

            const cktWtn = cols[0].trim();

            // Automatically skip the header row if the user accidentally pasted it
            if (index === 0 && cktWtn.toUpperCase() === 'CKT_WTN') return null;

            // Safely map columns. If Excel dropped trailing blank cells, this won't crash.
            return {
                ckt_wtn: cktWtn,
                wave_number: cols[1] ? cols[1].trim() : '',
                wave_name: cols[2] ? cols[2].trim() : '',
                wave_mail_date: cols[3] ? formatDateString(cols[3].trim()) : null,
                wave_respond_by_date: cols[4] ? formatDateString(cols[4].trim()) : null,
                wave_completion_date: cols[5] ? formatDateString(cols[5].trim()) : null,
                wave_complete: cols[6] ? cols[6].trim() : '',
                pod_circuit_status: cols[7] ? cols[7].trim() : '',
                rep_comment: cols[8] ? cols[8].trim() : ''
            };
        }).filter(r => r);

        if (records.length === 0) {
            showToast('No valid records found in pasted data. Ensure CKT_WTN is present.', 'error');
            return;
        }

        if (!confirm(`You are about to bulk update ${records.length} records. Continue?`)) {
            return;
        }
        payload.records = records;

    } else {
        // --- Single Update Logic ---
        const cktWtn = document.getElementById('cheetah-ckt-wtn').value.trim();
        if (!cktWtn) {
            showToast('CKT_WTN is required.', 'error');
            return;
        }
        if (!confirm(`Submit Cheetah VZT update for CKT_WTN ${cktWtn}?`)) {
            return;
        }

        payload.ckt_wtn = cktWtn;
        payload.wave_number = document.getElementById('cheetah-wave-number').value;
        payload.wave_name = document.getElementById('cheetah-wave-name').value;
        payload.wave_mail_date = document.getElementById('cheetah-mail-date').value;
        payload.wave_respond_by_date = document.getElementById('cheetah-respond-date').value;
        payload.wave_completion_date = document.getElementById('cheetah-completion-date').value;
        payload.wave_complete = document.getElementById('cheetah-wave-complete').value;
        payload.pod_circuit_status = document.getElementById('cheetah-circuit-status').value;
        payload.rep_comment = document.getElementById('cheetah-rep-comment').value;
    }

    // --- Execute the API Call ---
    try {
        const response = await fetch('/cheetah-writeback', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast(result.message, 'success');
            clearWritebackFormInputs('cheetahWritebackForm');
            // Optional: Automatically refresh the view so the user sees the changes immediately
            if (typeof updateCheetahView === 'function') updateCheetahView();
        } else {
            showToast(result.message, 'error');
        }
    } catch (e) {
        showToast('An error occurred while submitting.', 'error');
        console.error('Cheetah Writeback Error:', e);
    }
}


// ==========================================================================
//   Copy & Download Functions
// ==========================================================================

function getDataAndColumns(dataKey) {
    const tableData = allTableData[dataKey]?.json;
    if (!tableData || tableData.length === 0) {
        showToast('No data available for this table.', 'error');
        return null;
    }
    const columns = Object.keys(tableData[0]);
    return {tableData, columns};
}

async function copyTableData(dataKey) {
    const result = getDataAndColumns(dataKey);
    if (!result) return;
    const {tableData, columns} = result;

    let copyText = columns.join('\t') + '\n';
    tableData.forEach(row => {
        copyText += columns.map(col => String(row[col] ?? '')).join('\t') + '\n';
    });

    try {
        await navigator.clipboard.writeText(copyText);
        showToast('Table data copied to clipboard!');
    } catch (err) {
        console.error('Clipboard API failed, using fallback:', err);
        const textarea = document.createElement('textarea');
        textarea.value = copyText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy to clipboard');
            showToast('Table data copied via fallback!');
        } catch (copyErr) {
            showToast('Failed to copy data.', 'error');
        }
        document.body.removeChild(textarea);
    }
}

function downloadCSV(dataKey) {
    const result = getDataAndColumns(dataKey);
    if (!result) return;
    const {tableData, columns} = result;

    const csvHeader = columns.join(',') + '\r\n';
    const csvBody = tableData.map(row =>
        columns.map(col => {
            let cell = String(row[col] ?? '');
            return cell.includes(',') ? `"${cell.replace(/"/g, '""')}"` : cell;
        }).join(',')
    ).join('\r\n');

    const blob = new Blob([csvHeader + csvBody], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${dataKey}_results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function downloadExcel(dataKey) {
    const result = getDataAndColumns(dataKey);
    if (!result) return;
    const {tableData} = result;

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, `${dataKey}_results.xlsx`);
}

// ==========================================================================
//   Initial Page Load
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const firstNavTab = document.querySelector('.nav-bar .nav-tab');
    if (firstNavTab) {
        firstNavTab.click();
    }

    const processButton = document.getElementById('processButton');
    if (processButton) {
        processButton.addEventListener('click', processDecommData);
    }

    const reportButton = document.getElementById('generateReportBtn');
    if (reportButton) {
        reportButton.addEventListener('click', generatePubsecReport);
    }

    const analyzeBtn = document.getElementById('analyze-btn');
    const stateInput = document.getElementById('state-input');
    if (analyzeBtn && stateInput) {
        analyzeBtn.addEventListener('click', handleStrategicAnalysis);
        stateInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleStrategicAnalysis();
            }
        });
    }

    const updateFwaBtn = document.getElementById('fwa-update-view-btn');
    if (updateFwaBtn) {
        updateFwaBtn.addEventListener('click', updateFwaView);
    }
    const updatePubsecIlecBtn = document.getElementById('pubsec-ilec-update-view-btn');
    if (updatePubsecIlecBtn) {
        updatePubsecIlecBtn.addEventListener('click', updatePubsecIlecView);
    }
});