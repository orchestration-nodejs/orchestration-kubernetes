var cluster = require('./kubernetes/cluster');
var deployment = require('./kubernetes/deployment');
var service = require('./kubernetes/service');

function deployToCluster(config, environment, callback) {
  var monitorDeployment = function(err) {
    if (err) { callback(err); return; }
    deployment.waitForDeploymentToComplete(
      config.package.name,
      config.package.name,
      config.dockerImageVersion || config.package.version,
      callback);
  }

  var processService = function(services, offset, onSuccess, onError) {
    var services = config.orchestration.services[environment];

    var next = function() {
      if (offset == services.length - 1) {
        onSuccess();
      } else {
        processService(services, offset + 1, onSuccess, onError);
      }
    }

    service.ifServiceExists(
      services[offset].name,
      next,
      () => {
        service.createServiceForDeployment(
          config.package.name,
          services[offset],
          (err) => {
            if (err) {
              onError(err);
            } else {
              next();
            }
          }
        )
      },
      onError);
  }

  var deployServices = function(err) {
    if (err) { callback(err); return; }

    var services = config.orchestration.services[environment];
    if (services.length > 0) {
      processService(services, 0, monitorDeployment, callback);
    } else {
      monitorDeployment();
    }
  }

  var deployContainers = function(err) {
    if (err) { callback(err); return; }

    var dockerPrefix = config.cluster.environments[environment].dockerImagePrefix;

    var services = config.orchestration.services[environment];
    var containerPorts = [];
    for (var i = 0; i < services.length; i++) {
      if (services[i].type === 'HostPort') {
        if (services[i].containerPort != null && 
            services[i].hostPort != null &&
            services[i].name != null) {
          containerPorts.push({
            "type": "HostPort",
            "name": services[i].name,
            "containerPort": services[i].containerPort,
            "hostPort": services[i].hostPort,
            "protocol": services[i].protocol || "TCP"
          });
        }
      } else {
        var containerPort = services[i].containerPort;
        if (containerPort != null) {
          containerPorts.push({
            "type": "ServiceBound",
            "containerPort": containerPort
          });
        }
      }
    }

    var healthCheck = null;
    if (config.orchestration.healthCheckPort != null && config.orchestration.healthCheckPath != null) {
      healthCheck = {
        port: config.orchestration.healthCheckPort,
        path: config.orchestration.healthCheckPath,
      }
    }

    var envs = null;
    if (config.orchestration.variables != null) {
      var vars = config.orchestration.variables[environment];
      if (vars != null) {
        envs = vars;
      }
    }

    var replicas = null;
    if (config.orchestration.replicas != null) {
      var replicaConfig = config.orchestration.replicas[environment];
      if (replicaConfig != null) {
        replicas = replicaConfig;
      } 
    }

    var hostVolumes = null;
    if (config.orchestration.hostVolumes != null) {
      var hostVolumeConfig = config.orchestration.hostVolumes[environment];
      if (hostVolumeConfig != null) {
        hostVolumes = hostVolumeConfig;
      } 
    }

    cluster.loadAuthenticationCredentials(
      config.cluster.environments[environment].project, 
      config.cluster.environments[environment].clusterName, 
      config.cluster.environments[environment].clusterZone, 
      function(err) {
        if (err) { callback(err); return; }
        deployment.ifDeploymentExists(
          config.package.name, 
          () => {
            deployment.replaceDeployment(
              config.package.name, 
              dockerPrefix + config.package.name,
              config.dockerImageVersion || config.package.version,
              containerPorts,
              envs,
              replicas,
              hostVolumes,
              healthCheck,
              deployServices);
          },
          () => {
            deployment.createDeployment(
              config.package.name, 
              dockerPrefix + config.package.name,
              config.dockerImageVersion || config.package.version,
              containerPorts,
              envs,
              replicas,
              hostVolumes,
              healthCheck,
              deployServices);
          },
          callback);
      });
  };

  console.log("Deploying " + config.package.name + " at version " + (config.dockerImageVersion || config.package.version) + " to cluster...");

  cluster.ifClusterExists(
    config.cluster.environments[environment].project, 
    config.cluster.environments[environment].clusterZone, 
    config.cluster.environments[environment].clusterName, 
    deployContainers, 
    () => {
      cluster.createMinimalCluster(
        config.cluster.environments[environment].project, 
        config.cluster.environments[environment].clusterZone, 
        config.cluster.environments[environment].clusterName, 
        deployContainers);
    },
    callback);
}

module.exports = {
  deployToCluster: deployToCluster
}