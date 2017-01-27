var cluster = require('./kubernetes/cluster');
var deployment = require('./kubernetes/deployment');
var service = require('./kubernetes/service');

function deployToCluster(config, environment, callback) {
  var deploymentName = config.package.name;
  if (config.cluster && config.cluster.environments[environment] &&
      config.cluster.environments[environment].deploymentName != null) {
    deploymentName = config.cluster.environments[environment].deploymentName;
  }

  var monitorDeployment = function(err) {
    if (err) { callback(err); return; }
    deployment.waitForDeploymentToComplete(
      deploymentName,
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
          deploymentName,
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

    var resources = null;
    if (config.orchestration.resources != null) {
      var resourcesConfig = config.orchestration.resources[environment];
      if (resourcesConfig != null) {
        resources = resourcesConfig;
      }
    }

    var nodeSelector = null;
    if (config.cluster.environments[environment] != null) {
      if (config.cluster.environments[environment].placement != null) {
        nodeSelector = config.cluster.environments[environment].placement;
      }
    }

    cluster.loadAuthenticationCredentials(
      config.cluster.environments[environment].project, 
      config.cluster.environments[environment].clusterName, 
      config.cluster.environments[environment].clusterZone, 
      function(err) {
        if (err) { callback(err); return; }
        deployment.ifDeploymentExists(
          deploymentName, 
          () => {
            deployment.replaceDeployment(
              deploymentName, 
              dockerPrefix + config.package.name,
              config.dockerImageVersion || config.package.version,
              containerPorts,
              envs,
              replicas,
              hostVolumes,
              healthCheck,
              nodeSelector,
              resources,
              deployServices);
          },
          () => {
            deployment.createDeployment(
              deploymentName, 
              dockerPrefix + config.package.name,
              config.dockerImageVersion || config.package.version,
              containerPorts,
              envs,
              replicas,
              hostVolumes,
              healthCheck,
              nodeSelector,
              resources,
              deployServices);
          },
          callback);
      });
  };

  console.log("Deploying " + deploymentName + " at version " + (config.dockerImageVersion || config.package.version) + " to cluster...");

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