'use strict';

let angular = require('angular');

module.exports = angular.module('spinnaker.loadBalancer.aws.details.controller', [
  require('angular-ui-router'),
  require('angular-bootstrap'),
  require('../../../securityGroups/securityGroup.read.service.js'),
  require('../../loadBalancer.write.service.js'),
  require('../../loadBalancer.read.service.js'),
  require('utils/lodash.js'),
  require('../../../confirmationModal/confirmationModal.service.js')
])
  .controller('awsLoadBalancerDetailsCtrl', function ($scope, $state, $exceptionHandler, $modal, loadBalancer, application,
                                                   securityGroupReader, _, confirmationModalService, loadBalancerWriter, loadBalancerReader) {

    $scope.state = {
      loading: true
    };

    function extractLoadBalancer() {
      if (!loadBalancer.vpcId) {
        loadBalancer.vpcId = null;
      }
      $scope.loadBalancer = application.loadBalancers.filter(function (test) {
        var testVpc = test.vpcId || null;
        return test.name === loadBalancer.name && test.region === loadBalancer.region && test.account === loadBalancer.accountId && testVpc === loadBalancer.vpcId;
      })[0];

      if ($scope.loadBalancer) {
        var detailsLoader = loadBalancerReader.getLoadBalancerDetails($scope.loadBalancer.provider, loadBalancer.accountId, loadBalancer.region, loadBalancer.name);
        detailsLoader.then(function(details) {
          $scope.state.loading = false;
          var securityGroups = [];
          var filtered = details.filter(function(test) {
            return test.vpcid === loadBalancer.vpcId || (!test.vpcid && !loadBalancer.vpcId);
          });
          if (filtered.length) {
            $scope.loadBalancer.elb = filtered[0];
            $scope.loadBalancer.account = loadBalancer.accountId;

            if ($scope.loadBalancer.elb.availabilityZones) {
              $scope.loadBalancer.elb.availabilityZones.sort();
            }

            $scope.loadBalancer.elb.securityGroups.forEach(function (securityGroupId) {
              var match = securityGroupReader.getApplicationSecurityGroup(application, loadBalancer.accountId, loadBalancer.region, securityGroupId);
              if (match) {
                securityGroups.push(match);
              }
            });
            $scope.securityGroups = _.sortBy(securityGroups, 'name');
          }
        });
      }
      if (!$scope.loadBalancer) {
        $state.go('^');
      }
    }

    extractLoadBalancer();

    application.registerAutoRefreshHandler(extractLoadBalancer, $scope);

    //BEN_TODO

    this.editLoadBalancer = function editLoadBalancer() {
      var provider = $scope.loadBalancer.provider;
      $modal.open({
        template: '../../configure/' + provider + '/editLoadBalancer.html',
        controller: provider + 'CreateLoadBalancerCtrl as ctrl',
        resolve: {
          application: function() { return application; },
          loadBalancer: function() { return angular.copy($scope.loadBalancer); },
          isNew: function() { return false; }
        }
      });
    };

    this.cloneLoadBalancer = function () {
      var provider = $scope.loadBalancer.provider;
      $modal.open({
        template: '../../configure/' + provider + '/createLoadBalancer.html',
        controller: provider + 'CreateLoadBalancerCtrl as ctrl',
        resolve: {
          application: function() { return application; },
          loadBalancer: function() { return angular.copy($scope.loadBalancer); },
          isNew: function() { return true; }
        }
      });
    };

    this.deleteLoadBalancer = function deleteLoadBalancer() {
      if ($scope.loadBalancer.instances && $scope.loadBalancer.instances.length) {
        return;
      }

      var taskMonitor = {
        application: application,
        title: 'Deleting ' + loadBalancer.name,
        forceRefreshMessage: 'Refreshing application...',
        forceRefreshEnabled: true
      };

      var submitMethod = function () {
        loadBalancer.providerType = $scope.loadBalancer.type;
        loadBalancer.vpcId = angular.isDefined($scope.loadBalancer.elb) ? $scope.loadBalancer.elb.vpcid : loadBalancer.vpcId || null;
        return loadBalancerWriter.deleteLoadBalancer(loadBalancer, application);
      };

      confirmationModalService.confirm({
        header: 'Really delete ' + loadBalancer.name + '?',
        buttonText: 'Delete ' + loadBalancer.name,
        destructive: true,
        provider: 'aws',
        account: loadBalancer.accountId,
        applicationName: application.name,
        taskMonitorConfig: taskMonitor,
        submitMethod: submitMethod
      });
    };

  }
);
