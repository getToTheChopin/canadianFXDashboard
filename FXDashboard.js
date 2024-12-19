/*
To do:
Expand datasets to at least 10 years?
Button for 10 years time period
Custom start/end date
Adjust tooltip to be dynamic 1 CAD = 0.69 USD / 1 USD = 1.43 CAD
*/

let globalData = null;
let isInverted = true;
let charts = [];
let currentPeriod = '1y';
let flagCodes = ["us","eu","jp","gb","cn","au","ch","hk","sg","se","kr","no","nz","in","mx","tw","za","br","th","id","tr","sa","my","ru","pe","vn"];
let cutoffDate;

const periodLength = {
    '1m': 1,
    '3m': 3,
    '6m': 6,
    '1y': 1,
    //'3y': 3,
    '5y': 5,
    'all': Infinity
};

const periodNames = {
    '1m': '1-Month',
    '3m': '3-Month',
    '6m': '6-Month',
    '1y': '1-Year',
    //'3y': '3-Year',
    '5y': '5-Year',
    'all': 'All-Time'
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
        //showLoading();
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
        //hideLoading();
    } catch (error) {
        //hideLoading();
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
    if(currentPeriod == "all"){
        cutoffDate = moment(data.date[0], 'MM/DD/YYYY').subtract(1,'days');
        return data;
    }
    const lookbackLength = periodLength[period];
    if(currentPeriod == "1m" || currentPeriod == "3m" || currentPeriod == "6m"){
        cutoffDate = moment().subtract(lookbackLength, 'months').subtract(1,'days');
    } else {
        cutoffDate = moment().subtract(lookbackLength, 'years').subtract(1,'days');
    }
    //const cutoffDate = moment().subtract(days, 'days');
    const startIndex = data.date.findIndex(date => 
        moment(date, 'MM/DD/YYYY').isAfter(cutoffDate));

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

    const periodText = currentPeriod === 'all' ? 'All-time' : periodNames[currentPeriod];
    const headerRow = document.querySelector('#summaryTable thead tr');
    let formattedStartDate = moment(cutoffDate).add(1,'days').format('MMM-DD-YYYY');
    headerRow.innerHTML = `
        <th>Currency</th>
        <th class="table-right-align">Current Rate</th>
        <th class="table-right-align">Starting Rate (${formattedStartDate})</th>
        <th class="table-right-align">% Change (${periodNames[currentPeriod]})</th>
        <th>Analysis</th>
    `;

    const summaryData = [];

    document.querySelector("#tableIntroText").innerHTML = `The table below summarizes the performance of the CAD against all other currencies (time period: ${periodNames[currentPeriod]}). Click the blue buttons above to change the time period.`;

    Object.keys(filteredData).forEach(currency => {
        if (currency === 'date') return;

        const rateData = isInverted ? invertData(filteredData[currency]) : filteredData[currency];
        const currentRate = getCurrentRate(rateData);
        const startingRate = rateData[0]; // First rate in the filtered period
        
        if (currentRate === null || startingRate === null) return;

        const percentDiff = (calcPercentageDifference(currentRate,startingRate) * 100).toFixed(1);
        //const isStronger = isInverted ? percentDiff > 0 : percentDiff < 0;
        const isStronger = percentDiff >= 0;
        const absPercentDiff = Math.abs(percentDiff);

        summaryData.push({
            currency: currency.replace('FX', ''),
            currentRate: currentRate,
            startingRate: startingRate,
            percentDiff: percentDiff,
            isStronger: isStronger
        });
    });

    // Sort by percent difference
    summaryData.sort((a, b) => b.percentDiff - a.percentDiff);

    let counter = 0;

    summaryData.forEach(data => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.currency}</td>
            <td class="number">${formatNumber(data.currentRate)}</td>
            <td class="number">${formatNumber(data.startingRate)}</td>
            <td class="number ${data.isStronger ? 'stronger' : 'weaker'}">${(data.percentDiff)}%</td>
            <td class="${data.isStronger ? 'stronger' : 'weaker'}">
                Current CAD rate is ${Math.abs(data.percentDiff).toFixed(1)}% 
                ${data.isStronger ? 'stronger' : 'weaker'}
            </td>
        `;
        tbody.appendChild(row);
        counter++;
    });
}

async function createCharts(data) {
    //showLoading();
    return new Promise((resolve) => {
        setTimeout(async () => {
            document.getElementById('chartsContainer').innerHTML = '';
            charts = [];
            let counter = 0;

            //Display the date of the most recent data
            const mostRecentDate = moment(data.date[data.date.length - 1], 'MM/DD/YYYY').format('MMMM D, YYYY');
            const dataRecencyList = document.querySelectorAll('.dataRecency');
            let divArray = [...dataRecencyList];
            divArray.forEach(div => {
                div.textContent = `Data last updated on ${mostRecentDate}`;
            });

            //Update toggle perspective text
            if(isInverted){
                document.querySelector("#invertToggle").innerHTML = "Toggle Rate Perspective<br>(📈 = CAD stronger)";
            } else {
                document.querySelector("#invertToggle").innerHTML = "Toggle Rate Perspective<br>(📉 = CAD stronger)";
            }

            //Rate explanation text
            const rateExplanationList = document.querySelectorAll('.rateExplanation');
            let textArray = [...rateExplanationList];
            textArray.forEach(para => {
                if(isInverted){
                    para.innerHTML = `Rates are currently shown as <span class="highlight-yellow">1 CAD = X foreign currency</span>. To show the opposite perspective, click the green button (Toggle Rate Perspective).`;
                } else {
                    para.innerHTML = `Rates are currently shown as <span class="highlight-yellow">1 foreign currency = X CAD</span>. To show the opposite perspective, click the green button (Toggle Rate Perspective).`;
                }
            });

            const filteredData = filterDataByPeriod(data, currentPeriod);
            const chartsContainer = document.getElementById('chartsContainer');
            const headers = Object.keys(data).filter(header => header !== 'date');

            // Create the performance bar chart first
            createPerformanceBarChart(filteredData);

            for (const currency of headers) {
                const chartWrapper = document.createElement('div');
                chartWrapper.className = 'chart-wrapper';

                const chartContainer = document.createElement('div');
                chartContainer.className = 'chart-container';
                chartContainer.style.height = '300px';

                const canvas = document.createElement('canvas');
                chartContainer.appendChild(canvas);
                chartWrapper.appendChild(chartContainer);

                // Calculate and display performance metrics
                const performanceSummary = document.createElement('div');
                performanceSummary.className = 'performance-summary';
                chartWrapper.appendChild(performanceSummary);

                chartsContainer.appendChild(chartWrapper);

                const rateData = isInverted ? invertData(filteredData[currency]) : filteredData[currency];
                const periodAverage = calculatePeriodAverage(rateData);

                const startRate = rateData[0];
                const endRate = rateData[rateData.length - 1];
                const percentChange = calcPercentageDifference(endRate,startRate) * 100;
                const absPercentChange = Math.abs(percentChange);
                //const cadStrengthened = isInverted ? percentChange > 0 : percentChange < 0;
                const cadStrengthened = percentChange >= 0;
                performanceSummary.innerHTML = `
                    <span style="color: ${cadStrengthened ? '#28a745' : '#dc3545'}">
                        ${periodNames[currentPeriod]} performance of CAD: ${cadStrengthened ? '+' : '-'}${absPercentChange.toFixed(1)}% vs. ${currency}
                    </span>
                `;

                //Add country flags from flagpedia API
                const flagImage = document.createElement('img');
                flagImage.classList.add("flagImage");
                flagImage.src = "https://flagcdn.com/w40/"+flagCodes[counter]+".png";
                chartContainer.appendChild(flagImage);
                counter++;

                const chart = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: filteredData.date,
                        datasets: [
                            {
                                label: currency,
                                data: rateData,
                                borderColor: '#2196f3',
                                borderWidth: 2,
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
                                    `1 CAD = X ${currency}` : 
                                    `1 ${currency} = X CAD`,
                                font: {
                                    size: 18,
                                },
                                color: "#black",
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
                                    parser: 'MM/DD/YYYY',
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
            //hideLoading();
            resolve();
        }, 0);
    });
}

// Add this function after the existing chart creation function
function createPerformanceBarChart(filteredData) {
    // Remove existing performance chart if it exists
    const existingChart = document.getElementById('performanceBarChart');
    if (existingChart) {
        existingChart.remove();
    }
    
    const barChartContainer = document.querySelector("#performanceBarChartContainer");
    const canvas = document.createElement('canvas');
    canvas.id = 'performanceBarChart';
    barChartContainer.appendChild(canvas);

    // Calculate performance data for each currency
    const performanceData = [];
    Object.keys(filteredData).forEach(currency => {
        if (currency === 'date') return;

        const rateData = isInverted ? invertData(filteredData[currency]) : filteredData[currency];
        const startRate = rateData[0];
        const endRate = rateData[rateData.length - 1];
        const percentChange = calcPercentageDifference(endRate,startRate) * 100;
        // Invert the percentage if we're looking at inverted rates
        //const finalPercentChange = isInverted ? percentChange : -percentChange;

        const currencyCode = currency.replace('FX', '');

        performanceData.push({
            currency: `${currencyCode}`,
            percentChange: percentChange
        });
    });

    // Sort data from highest to lowest
    performanceData.sort((a, b) => b.percentChange - a.percentChange);

    // Create the bar chart
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: performanceData.map(d => d.currency),
            datasets: [{
                data: performanceData.map(d => d.percentChange),
                backgroundColor: performanceData.map(d => 
                    d.percentChange >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'
                ),
                borderColor: performanceData.map(d => 
                    d.percentChange >= 0 ? 'rgb(40, 167, 69)' : 'rgb(220, 53, 69)'
                ),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: {
                padding: {
                    left: 0,
                    right: 0,
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Canadian Dollar Performance vs. Global Currencies (${currentPeriod === 'all' ? 'All-Time' : periodNames[currentPeriod]})`,
                    font: {
                        size: 16
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `CAD ${value >= 0 ? 'strengthened' : 'weakened'} by ${Math.abs(value).toFixed(1)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    // suggestedMax: 20,
                    // max: 40,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                        callback: function(value) {
                            // if (value == 40) return '>40%';
                            return value + '%';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Canadian Dollar % Change vs. Select Currencies',
                        font: {
                            size: 14,
                            weight: 'normal'
                        },
                        padding: {
                            top: 10
                        }
                    },
                },
                y: {
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.1)',
                        drawOnChartArea: true,
                        drawTicks: false
                    },
                    ticks: {
                        callback: function(value) {
                            return this.getLabelForValue(value);
                        },
                        font: {
                            size: 10,
                        }
                    },
                    // afterFit: function(scaleInstance) {
                        // Increase the width of the y-axis to accommodate all labels
                        // scaleInstance.width = 100;
                    // }
                }
            }
        }
    });

    //Display text for top 3 / bottom 3 values
    const periodText = currentPeriod === 'all' ? 'all-time' : periodNames[currentPeriod];
    const strongestPerformers = performanceData.slice(0, 3);
    const weakestPerformers = performanceData.slice(-3).reverse();
    const summaryDiv = document.querySelector("#barChartResultDiv");

    let summaryHTML = `<p style="font-weight: bold;">Performance Summary (${periodText}):</p>`;
    summaryHTML += '<p style="color: #28a745;">Strongest CAD Performance:</p>';
    summaryHTML += '<ul>';
    strongestPerformers.forEach(perf => {
        summaryHTML += `<li>CAD strengthened by ${Math.abs(perf.percentChange).toFixed(1)}% against ${perf.currency}</li>`;
    });
    summaryHTML += '</ul>';

    summaryHTML += '<p style="color: #dc3545;">Weakest CAD Performance:</p>';
    summaryHTML += '<ul>';
    weakestPerformers.forEach(perf => {
        summaryHTML += `<li>CAD weakened by ${Math.abs(perf.percentChange).toFixed(1)}% against ${perf.currency}</li>`;
    });
    summaryHTML += '</ul>';

    summaryDiv.innerHTML = summaryHTML;
}

// Period selection handlers
document.querySelectorAll('[data-period]').forEach(button => {
    button.addEventListener('click', async (e) => {
        showLoading();
        currentPeriod = e.target.dataset.period;
        console.log("Time period: "+currentPeriod);

        document.querySelectorAll('[data-period]').forEach(btn => {
            btn.classList.remove('active');
            if(btn.dataset.period == currentPeriod){
                btn.classList.add('active');
            }
        });
        
        await createCharts(globalData);
        hideLoading();
    });
});

// Toggle button handler
document.getElementById('invertToggle').addEventListener('click', async () => {
    showLoading();
    isInverted = !isInverted;
    await createCharts(globalData);
    hideLoading();
});

function calcPercentageDifference(currentRate,startingRate){
    if(isInverted){
        return (currentRate/startingRate)-1;
    } else {
        return ((1/currentRate)/(1/startingRate))-1;
    }
}

// Load data when page loads
loadData();