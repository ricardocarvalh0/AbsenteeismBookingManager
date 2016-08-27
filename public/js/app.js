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
            return parseInt(dateSplitted[2] + dateSplitted[1] + dateSplitted[0])
        },

        getStartDateByString: function (dateStr, unit) {
            var dateSplitted = dateStr.split('/');
            var hour = unit === 'AM' ? 0 : 12;
            return new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0], hour, 0, 0);
        },

        getEndDateByString: function (dateStr, unit) {
            var dateSplitted = dateStr.split('/');
            var hour = unit === 'AM' ? 11 : 23;
            return new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0], hour, 59, 59);
        },

        getDiffBetweenDatesInDays: function (init, end) {
            var self = this;
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
            var self = this;
            return d3.nest()
                .key(function (d) {
                    return d.date;//self.getConcatenatedInt(d.date);
                }).sortKeys(d3.ascending)
                .rollup(function (d) {
                    return d;
                })
                .map(list);
        }
    }
});

app.controller('AbsenteeismCtrl', function BaconCtrl($q, $scope, $state, CsvService) {
    $scope.user = {id: 77, name: 'Ricardo Alves'};
    $scope.team_data = {};
    $scope.isLoading = true;
    $scope.dateFormatter = d3.time.format('%d/%m/%Y');
    $scope.xtasks = [];
    $scope.absenteeismCandidate = {};
    $scope.clashWarning = '';
    $scope.chartData = {
        tasks: [],
        taskNames: [],
        teamNames: [],
        removedNames: [],
        removedTasks: {},
        dateFormat: '%d-%m-%Y',
        taskStatus: {
            "P": "public-holiday",
            "PC": "public-holiday clash",
            "V": "vacation",
            "VC": "vacation clash",
            "PR": "present",
            "T": "training",
            "TC": "training clash"
        }
    };
    CsvService.getCsvData().then(function (csv) {
        $scope.team_data = csv;
        $scope.nested_by_name = CsvService.nestListByName(csv);
        $scope.nested_by_date = CsvService.nestListByDateInt(csv);
        console.log('nested_by_name', $scope.nested_by_name);
        console.log('nested_by_date', $scope.nested_by_date);
        $scope.chartData.taskNames = _.sortBy(_.keys($scope.nested_by_name));
        $scope.chartData.teamNames = _.uniq(_.map(csvData, 'team'));
        $scope.chartData.isTeamVisibleMap = {};
        _.each($scope.chartData.teamNames, function (teamName) {
            $scope.chartData.isTeamVisibleMap[teamName] = true;
        });
        $scope.gantt = null;// = d3.gantt().selector('#chart').taskTypes($scope.chartData.taskNames).taskStatus($scope.chartData.taskStatus).tickFormat($scope.chartData.dateFormat);

        $scope.$watch('nested_by_name', function (newVal, oldVal) {
            $scope.fillByNested();
        }, true);

        $scope.fillByNested = function () {
            $scope.chartData.tasks = [];
            $scope.chartData.taskNames = _.sortBy(_.keys($scope.nested_by_name));
            $scope.gantt = d3.gantt().selector('#chart').taskTypes($scope.chartData.taskNames).taskStatus($scope.chartData.taskStatus).tickFormat($scope.chartData.dateFormat);
            _.each($scope.nested_by_name, function (recordsByMember, memberName) {
                var chartRecord = {
                    startDate: '',
                    endDate: '',
                    taskName: memberName,
                    status: ''
                };
                var sorted = _.sortBy(recordsByMember, function (record) {
                    return CsvService.getConcatenatedInt(record.date);
                });
                _.each(sorted, function (record) {
                    if (!chartRecord.startDate) {
                        chartRecord.startDate = CsvService.getStartDateByString(record.date, record.unit);
                    }

                    if (!chartRecord.status) {
                        chartRecord.endDate = CsvService.getEndDateByString(record.date, record.unit);
                        chartRecord.status = record.value;
                        chartRecord.concatenatedInt = CsvService.getConcatenatedInt(record.date);
                    } else if (CsvService.getDiffBetweenDatesInDays(chartRecord.endDate, record.date) > 1 || record.value !== chartRecord.status) {
                        $scope.chartData.tasks.push(chartRecord);
                        chartRecord = {
                            startDate: CsvService.getStartDateByString(record.date, record.unit),
                            endDate: CsvService.getEndDateByString(record.date, record.unit),
                            taskName: memberName,
                            status: record.value
                        };
                    } else {
                        chartRecord.clash = chartRecord.clash || record.hasClash;
                        chartRecord.endDate = CsvService.getEndDateByString(record.date, record.unit);
                        chartRecord.concatenatedInt = CsvService.getConcatenatedInt(record.date);
                    }
                });
                if (chartRecord.startDate) {
                    $scope.chartData.tasks.push(chartRecord);
                    chartRecord = {
                        startDate: '',
                        endDate: '',
                        taskName: memberName,
                        status: ''
                    };
                }
            });

            if ($scope.isLoading) {
                $scope.gantt($scope.chartData.tasks);
            } else {
                $scope.gantt.redraw($scope.chartData.tasks);
            }

            d3.select('.y.axis')
                .selectAll('.tick.major')
                .on('click', function (memberName) {
                    $scope.removeMember(memberName);
                    $scope.$digest();
                });

            d3.selectAll('.vacation,.training,.public-holiday').on('click', function (d) {
                var r = confirm("Do you want to remove this record?");
                if (r) {
                    console.log("You pressed OK!");

                    var days = d3.time.days(d.startDate, d.endDate);
                    _.each(days, function (day) {
                        var removedRecords = _.remove($scope.nested_by_name[d.taskName], function (record) {
                            return record.date === $scope.dateFormatter(day);
                        });
                        if (_.find(removedRecords, function (removedRecod) {
                                return removedRecod.value.indexOf('C') !== -1;
                            })) {
                            $scope.clashWarning = '';
                        }
                    });
                    $scope.$digest();
                    console.log(days);
                }
            });
            $scope.isLoading = false;
        };

        $scope.removeMember = function (member) {
            $scope.chartData.removedTasks[member] = $scope.nested_by_name[member];
            delete $scope.nested_by_name[member];
            Array.prototype.push.apply($scope.chartData.removedNames, _.remove($scope.chartData.taskNames, function (record) {
                return record === member;
            }));
        };

        $scope.toggleTeam = function (team) {
            if ($scope.chartData.isTeamVisibleMap[team]) {
                var teamMembers = _.filter($scope.chartData.taskNames, function (name) {
                    return name.indexOf(' - ' + team) !== -1;
                });
                _.each(teamMembers, function (member) {
                    $scope.removeMember(member);
                });
            } else {
                var removedTeamMembers = _.filter($scope.chartData.removedNames, function (name) {
                    return name.indexOf(' - ' + team) !== -1;
                });
                console.log('removed team members', removedTeamMembers);
                _.each(removedTeamMembers, function (member) {
                    $scope.restoreTask(member);
                });
            }
            $scope.chartData.isTeamVisibleMap[team] = !$scope.chartData.isTeamVisibleMap[team];
        };

        $scope.checkIfGenerateClash = function (date) {
            var dateRecords = $scope.nested_by_date[date];
            if (!dateRecords) return false;
            var recordsWithoutUser = _.filter(dateRecords, function (record) {
                return record.name !== $scope.user.name && record.value !== 'P';
            });
            if (recordsWithoutUser.length) {
                $scope.clashWarning = 'A new clash has been detected with ' + _.uniq(_.map(recordsWithoutUser, 'name')).join(', ');
            }
            return !!recordsWithoutUser.length;
        };

        $scope.addTask = function () {
            var clashWithin = 4;
            var dateSplitted = $scope.absenteeismCandidate.startDate.split('/');
            var typedDate = new Date(dateSplitted[2], dateSplitted[1] - 1, dateSplitted[0]);
            var start = d3.time.day.offset(typedDate, -clashWithin);
            var end = d3.time.day.offset(typedDate, $scope.absenteeismCandidate.duration + clashWithin);
            var days = d3.time.days(start, end);
            var hasClash = false;
            var newRegs = [];
            _.each(days, function (day, idx) {
                hasClash = hasClash || $scope.checkIfGenerateClash($scope.dateFormatter(day));
                if (idx >= clashWithin && idx < (days.length - idx)) {
                    newRegs.push({
                        userid: $scope.user.id,
                        name: $scope.user.name,
                        date: $scope.dateFormatter(day),
                        unit: 'AM',
                        value: $scope.absenteeismCandidate.value
                    });
                    newRegs.push({
                        userid: $scope.user.id,
                        name: $scope.user.name,
                        date: $scope.dateFormatter(day),
                        unit: 'PM',
                        value: $scope.absenteeismCandidate.value
                    });
                }
            });

            if (hasClash) {
                _.each(newRegs, function (reg) {
                    reg.value = reg.value + 'C';
                })
            }

            Array.prototype.push.apply($scope.nested_by_name[$scope.user.name], newRegs);

        };

        $scope.restoreTask = function (name) {
            _.remove($scope.chartData.removedNames, function (record) {
                return record === name;
            });

            if (!$scope.nested_by_name[name]) $scope.nested_by_name[name] = [];
            $scope.nested_by_name[name] = $scope.chartData.removedTasks[name];
        };
    });
});

app.directive('gantt', function () {
    return {
        restrict: 'E',
        link: function ($scope, $element) {
            var gantt = d3.gantt().selector($element[0]).taskTypes($scope.chartData.taskNames).taskStatus($scope.chartData.taskStatus).tickFormat($scope.chartData.dateFormat);
            $scope.$watch('team_data', function (newVal, oldVal) {
                if (!$scope.isLoading) {
                    redrawChart(newVal);
                }
            }, true);

            function redrawChart(newVal) {
                console.log('controller data has changed to', newVal);
            }

            function drawChart() {
                gantt($scope.chartData.tasks);
                $scope.isLoading = false;
            }

            drawChart();
        }
    }
});