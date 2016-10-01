var runProcessAndCapture = require('orchestration-util-process').runProcessAndCapture;
var runProcessWithOutput = require('orchestration-util-process').runProcessWithOutput;
var process = require('process');

function ifServiceExists(serviceName, onExistsCallback, onNotExistsCallback, onErrorCallback) {
  console.log("Checking if service exists...");
  runProcessAndCapture(
    'kubectl',
    [
      '--kubeconfig=.kube/config',
      '--output',
      'json',
      'get',
      'services'
    ],
    function(output, err) {
      if (err) { onErrorCallback(err); return; }

      var data = JSON.parse(output);

      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].metadata.name == serviceName) {
          console.log("Found target service.");
          onExistsCallback();
          return;
        }
      }

      console.log("Target service is missing.");
      onNotExistsCallback();
    }
  )
}

function createServiceForDeployment(deploymentName, serviceProps, callback) {
  console.log("Creating service for deployment " + deploymentName + "...");

  if (serviceProps.type == 'LoadBalancer') {
    runProcessWithOutput(
      'kubectl',
      [
        '--kubeconfig=.kube/config',
        'expose',
        'deployment',
        deploymentName,
        '--port='+serviceProps.publicPort,
        '--target-port='+serviceProps.containerPort,
        '--type='+serviceProps.type,
        '--protocol='+serviceProps.protocol,
        '--load-balancer-ip='+serviceProps.ipAddress,
        '--name='+serviceProps.name
      ],
      callback
    );
  } else if (serviceProps.type == 'NodePort') {
    if (serviceProps.publicPort != null) {
      runProcessWithOutput(
        'kubectl',
        [
          '--kubeconfig=.kube/config',
          'expose',
          'deployment',
          deploymentName,
          '--port='+serviceProps.publicPort,
          '--target-port='+serviceProps.containerPort,
          '--type='+serviceProps.type,
          '--protocol='+serviceProps.protocol,
          '--name='+serviceProps.name
        ],
        callback
      );
    } else {
      runProcessWithOutput(
        'kubectl',
        [
          '--kubeconfig=.kube/config',
          'expose',
          'deployment',
          deploymentName,
          '--target-port='+serviceProps.containerPort,
          '--type='+serviceProps.type,
          '--protocol='+serviceProps.protocol,
          '--name='+serviceProps.name
        ],
        callback
      );
    }
  } else if (serviceProps.type == 'ClusterIP') {
    runProcessWithOutput(
      'kubectl',
      [
        '--kubeconfig=.kube/config',
        'expose',
        'deployment',
        deploymentName,
        '--port='+serviceProps.publicPort,
        '--target-port='+serviceProps.containerPort,
        '--type='+serviceProps.type,
        '--protocol='+serviceProps.protocol,
        '--name='+serviceProps.name
      ],
      callback
    );
  }
}

module.exports = {
  ifServiceExists: ifServiceExists,
  createServiceForDeployment: createServiceForDeployment,
};