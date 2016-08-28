/**
 * Created by ric on 23/08/2016.
 */
var app = angular.module('absenteeism', ['ui.router']);

app.config(function ($stateProvider, $urlRouterProvider) {
    $stateProvider
        .state('absenteeism', {
            url: '/absenteeism',
            controller: 'AbsenteeismCtrl',
            templateUrl: '/templates/absenteeism.html'
        });

    $urlRouterProvider.otherwise('/absenteeism');
});

app.factory('CsvService', function ($q) {
    this.csvData = {};
    return {
        loadCsvData: function () {
            var deferred = $q.defer();
            d3.csv('/sampledata.csv', function (csv) {
                var self = this;
                self.csvData = csv;
                deferred.resolve();
            });
            return deferred.promise;
        },

        getCsvData: function () {
            return this.loadCsvData().then(function () {
                return csvData;
            });
        },

        getConcatenatedInt: function (dateStr) {
            var dateSplitted = dateStr.split('/');
            return parseInt(dateSplitted[2] + dateSplitted[1] + dateSplitted[0]); //Transforms 22/11/2016 in 20161122
        },

        getStartDateByString: function (dateStr, unit) {
            //AM starts at 00:00:00 , PM starts at 12:00:00
            var dateSplitted = dateStr.split('/');
            var hour = unit === 'AM' ? 0 : 12;
            return new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0], hour, 0, 0);
        },

        getEndDateByString: function (dateStr, unit) {
            //AM ends at 11:59:59 , PM ends at 23:59:00
            var dateSplitted = dateStr.split('/');
            var hour = unit === 'AM' ? 11 : 23;
            return new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0], hour, 59, 59);
        },

        getDiffBetweenDatesInDays: function (init, end) {
            var splitted = end.split('/');
            var endDate = new Date(splitted[2], splitted[1] - 1, splitted[0]);
            return d3.time.day.range(init, endDate).length;
        },

        nestListByName: function (list) {
            return d3.nest()
                .key(function (d) {
                    return d.name + ' - ' + d.team;
                }).sortKeys(d3.ascending)
                .rollup(function (d) {
                    return d;
                })
                .map(list);
        },

        nestListByDateInt: function (list) {
            return d3.nest()
                .key(function (d) {
                    return d.date;
                }).sortKeys(d3.ascending)
                .rollup(function (d) {
                    return d;
                })
                .map(list);
        }
    }
});

app.controller('AbsenteeismCtrl', function BaconCtrl($scope, CsvService) {

    $scope.user = {id: 77, name: 'Ricardo Alves', team: 'RH'};
    $scope.isFirstTimeLoading = true;
    $scope.dateFormatter = d3.time.format('%d/%m/%Y');
    $scope.xtasks = [];
    $scope.absenteeismCandidate = {};
    $scope.clashWarning = '';
    $scope.chartData = {
        width: 1200,
        height: 700,
        tasks: [],
        employeeNames: [],
        teamNames: [],
        removedNames: [],
        removedEntries: {},
        dateFormat: '%d-%m-%Y',
        absenteeismStatus: {
            "P": "public-holiday",
            "V": "vacation",
            "VC": "vacation clash",
            "T": "training",
            "TC": "training clash"
        }
    };

    $scope.$watch('nested_by_name', function (newVal, oldVal) {
        $scope.fillByNested();
    }, true);

    CsvService.getCsvData().then(function (csv) {
        $scope.nested_by_name = CsvService.nestListByName(csv); // Object watched by the chart
        $scope.nested_by_date = CsvService.nestListByDateInt(csv); // Object for consulting clashes

        $scope.chartData.employeeNames = _.sortBy(_.keys($scope.nested_by_name));
        $scope.chartData.teamNames = _.uniq(_.map(csvData, 'team'));
        $scope.chartData.isTeamVisibleMap = {};

        console.log('nested_by_name', $scope.nested_by_name);
        console.log('nested_by_date', $scope.nested_by_date);

        _.each($scope.chartData.teamNames, function (teamName) {
            $scope.chartData.isTeamVisibleMap[teamName] = true;
        });
    });


    $scope.fillByNested = function () {
        $scope.chartData.entries = [];
        $scope.chartData.employeeNames = _.sortBy(_.keys($scope.nested_by_name));
        $scope.gantt = d3.gantt().selector('#chart').taskTypes($scope.chartData.employeeNames).taskStatus($scope.chartData.absenteeismStatus).tickFormat($scope.chartData.dateFormat).width($scope.chartData.width).height($scope.chartData.height);

        _.each($scope.nested_by_name, function (csvEntriesByEmployee, memberName) {
            var chartRecord = {
                startDate: '',
                endDate: '',
                taskName: memberName,
                status: ''
            };
            var employeeEntriesOrderedByDate = _.sortBy(csvEntriesByEmployee, function (csvEntry) {
                return CsvService.getConcatenatedInt(csvEntry.date);
            });

            //Transforms consecutive csv entries in one chart record
            //i,e. {name: John, date: 12/11/2016} and {name: John, date: 13/11/2016} can be added to the chart as only
            //     one record {name: John, start: 12/11/2016, end: 13/11/2016}
            _.each(employeeEntriesOrderedByDate, function (csvEntry) {
                if (!chartRecord.startDate) {
                    chartRecord.startDate = CsvService.getStartDateByString(csvEntry.date, csvEntry.unit);
                }
                if (!chartRecord.status) {
                    chartRecord.endDate = CsvService.getEndDateByString(csvEntry.date, csvEntry.unit);
                    chartRecord.status = csvEntry.value;
                } else if (CsvService.getDiffBetweenDatesInDays(chartRecord.endDate, csvEntry.date) > 1 || csvEntry.value !== chartRecord.status) {
                    $scope.chartData.entries.push(chartRecord);
                    chartRecord = {
                        startDate: CsvService.getStartDateByString(csvEntry.date, csvEntry.unit),
                        endDate: CsvService.getEndDateByString(csvEntry.date, csvEntry.unit),
                        taskName: memberName,
                        status: csvEntry.value
                    };
                } else {
                    chartRecord.endDate = CsvService.getEndDateByString(csvEntry.date, csvEntry.unit);
                }
            });
            if (chartRecord.startDate) {
                $scope.chartData.entries.push(chartRecord);
                chartRecord = {
                    startDate: '',
                    endDate: '',
                    taskName: memberName,
                    status: ''
                };
            }
        });

        if ($scope.isFirstTimeLoading) {
            $scope.gantt($scope.chartData.entries);
        } else {
            $scope.gantt.redraw($scope.chartData.entries);
        }

        //yAxis name click handler
        d3.select('.y.axis')
            .selectAll('.tick.major')
            .on('click', function (employee) {
                $scope.removeEmployee(employee);
                $scope.$digest();
            });

        //Chart record click handler
        d3.selectAll('.vacation,.training,.public-holiday').on('click', function (d) {
            var wantsToRemoveTheRecord = confirm("Do you want to remove this record?");
            if (wantsToRemoveTheRecord) {
                var days = d3.time.days(d.startDate, d.endDate);
                _.each(days, function (day) {
                    var removedRecords = _.remove($scope.nested_by_name[d.taskName], function (record) {
                        return record.date === $scope.dateFormatter(day);
                    });

                    //Restore the color names of xAxis ff a clash is removed
                    if (_.find(removedRecords, function (removedRecord) {
                            return removedRecord.value.indexOf('C') !== -1;
                        })) {
                        $scope.clashWarning = '';
                        d3.selectAll('text').attr('fill', 'black');
                    }
                });
                $scope.$digest();
            }
        });
        $scope.setLegend();
        $scope.isFirstTimeLoading = false;
    };

    //Builds the chart legend
    $scope.setLegend = function () {
        if (d3.select('.legend').empty()) {
            var legend = d3.select("svg").append("g")
                .attr("class", "legend")
                .attr("height", 100)
                .attr("width", 100)
                .attr('transform', 'translate(20,30)');

            legend.selectAll('rect')
                .data(_.keys($scope.chartData.absenteeismStatus))
                .enter()
                .append("rect")
                .attr("x", $scope.chartData.width + 200)
                .attr("y", function (d, i) {
                    return i * 40;
                })
                .attr("width", 25)
                .attr("height", 25)
                .attr("class", function (d) {
                    return $scope.chartData.absenteeismStatus[d];
                });

            legend.selectAll('text')
                .data(_.keys($scope.chartData.absenteeismStatus))
                .enter()
                .append("text")
                .attr("x", $scope.chartData.width + 230)
                .attr("y", function (d, i) {
                    return i * 40 + 15;
                })
                .text(function (d) {
                    return $scope.chartData.absenteeismStatus[d];
                }).attr('font-size', 14)
                .attr('margin-top', 20);
        }
    };

    $scope.removeEmployee = function (employeeToRemove) {
        $scope.chartData.removedEntries[employeeToRemove] = $scope.nested_by_name[employeeToRemove];
        delete $scope.nested_by_name[employeeToRemove];
        Array.prototype.push.apply($scope.chartData.removedNames, _.remove($scope.chartData.employeeNames, function (employee) {
            return employee === employeeToRemove;
        }));
    };

    $scope.toggleTeam = function (team) {
        if ($scope.chartData.isTeamVisibleMap[team]) {
            var teamMembers = _.filter($scope.chartData.employeeNames, function (name) {
                return name.indexOf(' - ' + team) !== -1;
            });
            _.each(teamMembers, function (member) {
                $scope.removeEmployee(member);
            });
        } else {
            var removedTeamMembers = _.filter($scope.chartData.removedNames, function (name) {
                return name.indexOf(' - ' + team) !== -1;
            });
            _.each(removedTeamMembers, function (member) {
                $scope.restoreTask(member);
            });
        }
        $scope.chartData.isTeamVisibleMap[team] = !$scope.chartData.isTeamVisibleMap[team];
    };

    $scope.checkIfGenerateClash = function (date) {
        var csvEntriesAtDate = $scope.nested_by_date[date];
        if (!csvEntriesAtDate) return false;
        var csvEntriesFromOthers = _.filter(csvEntriesAtDate, function (record) {
            return record.name !== $scope.user.name && record.value !== 'P';
        });
        if (csvEntriesFromOthers.length) {
            var namesWithClash = _.uniq(_.map(csvEntriesFromOthers, 'name'));
            $scope.clashWarning = 'A new clash has been detected with ' + namesWithClash.join(', ');

            //Fills clashed axis names with red
            d3.selectAll('text').filter(function (d) {
                return _.find(namesWithClash, function (name) {
                    return !(d instanceof Date) && d.indexOf(name) !== -1;
                });
            }).attr('fill', 'red');
        }
        return !!csvEntriesFromOthers.length;
    };

    $scope.addTask = function () {
        if ($scope.clashWarning) {
            alert('Resolve your clash!');
            return;
        }
        var clashWithin = 4;
        var dateSplitted = $scope.absenteeismCandidate.startDate.split('/');
        var startDate = new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0]);

        //need to check clashes 4 days before the start date and 4 days after the end date
        var start = d3.time.day.offset(startDate, -clashWithin);
        var end = d3.time.day.offset(startDate, $scope.absenteeismCandidate.duration + clashWithin);
        var days = d3.time.days(start, end);

        var hasClash = false;
        var newEntries = [];
        _.each(days, function (day, idx) {
            hasClash = hasClash || $scope.checkIfGenerateClash($scope.dateFormatter(day));
            if (idx >= clashWithin && idx < (days.length - idx)) {
                newEntries.push({
                    userid: $scope.user.id,
                    name: $scope.user.name,
                    team: $scope.user.team,
                    date: $scope.dateFormatter(day),
                    unit: 'AM',
                    value: $scope.absenteeismCandidate.value
                });
                newEntries.push({
                    userid: $scope.user.id,
                    name: $scope.user.name,
                    team: $scope.user.team,
                    date: $scope.dateFormatter(day),
                    unit: 'PM',
                    value: $scope.absenteeismCandidate.value
                });
            }
        });

        if (hasClash) {
            //Adds clash css
            _.each(newEntries, function (reg) {
                reg.value = reg.value + 'C';
            })
        }

        //Retores the user data if it is hidden before adding new entries
        if (!$scope.nested_by_name[$scope.user.name + ' - ' + $scope.user.team]) {
            $scope.restoreTask($scope.user.name + ' - ' + $scope.user.team);
        }

        Array.prototype.push.apply($scope.nested_by_name[$scope.user.name + ' - ' + $scope.user.team], newEntries);

    };

    $scope.restoreTask = function (name) {
        _.remove($scope.chartData.removedNames, function (record) {
            return record === name;
        });

        if (!$scope.nested_by_name[name]) $scope.nested_by_name[name] = [];
        $scope.nested_by_name[name] = $scope.chartData.removedEntries[name];
    };
});