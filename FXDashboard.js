/*
To do:
Sortable data / formatting for the table?
Expand datasets to at least 10 years?
Button for 10 years time period
Explanatory text
Add bullet with % change over selected time period under each chart (strengthened / weakened text)?
*/

let globalData = null;
let isInverted = true;
let charts = [];
let currentPeriod = 'all';
let flagCodes = ["us","eu","jp","gb","cn","au","ch","hk","sg","se","kr","no","nz","in","mx","tw","za","br","th","id","tr","sa","my","ru","pe","vn"];

const periodDays = {
    '1m': 30,
    '3m': 90,
    '6m': 180,
    '1y': 365,
    '3y': 1095,
    '5y': 1825,
    'all': Infinity
};

const periodNames = {
    '1m': '1 month',
    '3m': '3 month',
    '6m': '6 month',
    '1y': '1 year',
    '3y': '3 year',
    '5y': '5 year',
    'all': 'all-time'
};

function formatNumber(value) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3
    }).format(value);
}

function showLoading() {
    document.querySelector('.loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.querySelector('.loading-overlay').style.display = 'none';
}

async function loadData() {
    try {
        showLoading();
        // Convert Google Sheets published URL to CSV export URL
        const sheetId = '2PACX-1vQt50x6wnHqwl64lQwYyfQ7psOkICv9aaqLYY9KI5g-aqlZ7VXtIl7YWo0STGmsPPxzurgN8wtmi_Es';
        const csvUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv`;
        
        // Use Papaparse to fetch and parse the CSV data
        const response = await new Promise((resolve, reject) => {
            Papa.parse(csvUrl, {
                download: true,
                header: true,
                dynamicTyping: true,
                complete: resolve,
                error: reject
            });
        });

        // Transform the parsed data into the required format
        globalData = transformPapaParsedData(response.data);
        await createCharts(globalData);
        hideLoading();
    } catch (error) {
        hideLoading();
        alert('Error loading data: ' + error.message);
    }
}

function transformPapaParsedData(parsedData) {
    // Initialize the data structure
    const transformedData = {
        date: []
    };

    // Get all column headers except 'date'
    const headers = Object.keys(parsedData[0]).filter(header => header !== 'date');
    headers.forEach(header => {
        transformedData[header] = [];
    });

    // Populate the arrays
    parsedData.forEach(row => {
        transformedData.date.push(row.date);
        headers.forEach(header => {
            transformedData[header].push(row[header]);
        });
    });

    return transformedData;
}

function filterDataByPeriod(data, period) {
    const days = periodDays[period];
    if (days === Infinity) return data;

    const cutoffDate = moment().subtract(days, 'days');
    const startIndex = data.date.findIndex(date => 
        moment(date, 'M/D/YY').isAfter(cutoffDate));

    return Object.fromEntries(
        Object.entries(data).map(([key, values]) => [
            key,
            values.slice(startIndex)
        ])
    );
}

function calculatePeriodAverage(data) {
    const validData = data.filter(value => value !== null);
    if (validData.length === 0) return null;
    const sum = validData.reduce((a, b) => a + b, 0);
    return sum / validData.length;
}

function getCurrentRate(data) {
    const validData = data.filter(value => value !== null);
    return validData[validData.length - 1];
}

function invertData(data) {
    return data.map(value => value !== null ? 1 / value : null);
}

function updateSummaryTable(filteredData) {
    const tbody = document.querySelector('#summaryTable tbody');
    tbody.innerHTML = '';

    const summaryData = [];

    if(isInverted){
      document.querySelector("#tableHeaderText").innerHTML = "Foreign Currency per CAD";
    } else {
      document.querySelector("#tableHeaderText").innerHTML = "CAD per Foreign Currency";
    }

    Object.keys(filteredData).forEach(currency => {
        if (currency === 'date') return;

        const rateData = isInverted ? invertData(filteredData[currency]) : filteredData[currency];
        const currentRate = getCurrentRate(rateData);
        const averageRate = calculatePeriodAverage(rateData);
        
        if (currentRate === null || averageRate === null) return;

        const percentDiff = (((currentRate - averageRate) / averageRate) * 100).toFixed(1);
        const isStronger = isInverted ? percentDiff > 0 : percentDiff < 0;
        const absPercentDiff = Math.abs(percentDiff);

        summaryData.push({
            currency: currency.replace('FX', ''),
            currentRate: currentRate,
            averageRate: averageRate,
            percentDiff: percentDiff,
            isStronger: isStronger
        });
    });

    // Sort by percent difference
    if(isInverted){
      summaryData.sort((a, b) => b.percentDiff - a.percentDiff);
    } else {
      summaryData.sort((b, a) => b.percentDiff - a.percentDiff);
    }

    let counter = 0;

    summaryData.forEach(data => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.currency}</td>
            <td class="number">${formatNumber(data.currentRate)}</td>
            <td class="number">${formatNumber(data.averageRate)}</td>
            <td class="number">${(data.percentDiff)}%</td>
            <td class="${data.isStronger ? 'stronger' : 'weaker'}">
                Current CAD rate is ${Math.abs(data.percentDiff).toFixed(1)}% 
                ${data.isStronger ? 'stronger' : 'weaker'} than ${periodNames[currentPeriod]} average
            </td>
        `;
        tbody.appendChild(row);
        counter++;
    });
}

async function createCharts(data) {
    return new Promise((resolve) => {
        showLoading();
        setTimeout(async () => {
            document.getElementById('chartsContainer').innerHTML = '';
            charts = [];
            let counter = 0;
            
            const filteredData = filterDataByPeriod(data, currentPeriod);
            const chartsContainer = document.getElementById('chartsContainer');
            const headers = Object.keys(data).filter(header => header !== 'date');

            //Update toggle perspective text
            if(isInverted){
              document.querySelector("#invertToggle").innerHTML = "Toggle Rate Perspective<br>Foreign Currency per CAD<br>(📈 = CAD stronger)";
            } else {
              document.querySelector("#invertToggle").innerHTML = "Toggle Rate Perspective<br>CAD per Foreign Currency<br>(📉 = CAD stronger)";
            }

            for (const currency of headers) {
                const chartContainer = document.createElement('div');
                chartContainer.className = 'chart-container';
                chartContainer.style.height = '300px';
                
                const canvas = document.createElement('canvas');
                chartContainer.appendChild(canvas);

                //Add country flags from flagpedia API
                const flagImage = document.createElement('img');
                flagImage.classList.add("flagImage");
                flagImage.src = "https://flagcdn.com/w40/"+flagCodes[counter]+".png";
                chartContainer.appendChild(flagImage);
                counter++;

                chartsContainer.appendChild(chartContainer);

                const rateData = isInverted ? invertData(filteredData[currency]) : filteredData[currency];
                const periodAverage = calculatePeriodAverage(rateData);

                const chart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: filteredData.date,
                        datasets: [
                            {
                                label: currency,
                                data: rateData,
                                borderColor: '#2196f3',
                                borderWidth: 1,
                                pointRadius: 0,
                                fill: false,
                                spanGaps: true
                            },
                            {
                                label: `${periodNames[currentPeriod]} Average`,
                                data: Array(filteredData.date.length).fill(periodAverage),
                                borderColor: '#ff9800',
                                borderWidth: 1,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: {
                                display: true,
                                text: isInverted ? 
                                    `${currency} per CAD` : 
                                    `CAD per ${currency}`,
                                font: {
                                    size: 16
                                }
                            },
                            legend: {
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return `${context.dataset.label}: ${formatNumber(context.parsed.y)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                type: 'time',
                                time: {
                                    parser: 'M/D/YY',
                                    tooltipFormat: 'MMM D, YYYY',
                                    unit: 'month',
                                    displayFormats: {
                                        month: 'MMM YYYY'
                                    }
                                },
                                ticks: {
                                    maxRotation: 0
                                }
                            },
                            y: {
                                beginAtZero: false,
                                ticks: {
                                    callback: function(value) {
                                        return formatNumber(value);
                                    }
                                }
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        }
                    }
                });
                
                charts.push(chart);
            }

            updateSummaryTable(filteredData);
            hideLoading();
            resolve();
        }, 0);
    });
}

// Period selection handlers
document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', async (e) => {
        document.querySelectorAll('[data-period]').forEach(btn => 
            btn.classList.remove('active'));
        e.target.classList.add('active');
        currentPeriod = e.target.dataset.period;
        await createCharts(globalData);
    });
});

// Toggle button handler
document.getElementById('invertToggle').addEventListener('click', async () => {
    isInverted = !isInverted;
    await createCharts(globalData);
});

// Load data when page loads
loadData();