var sfConstants = require('./../../constants');
angular.module('sf.services.form', [
  sfConstants,
])

.service("Form", function(baseFbUrl, $firebase ) {
  var form = this;

  var activitesRef = new Firebase(baseFbUrl + "/activities");

  form.submit = function(activityUid, f, cb) {
    // Ensure that activities are keyed to the activity's original UID
    // so that we can look it up later.
    activitesRef.child(activityUid).set(angular.copy(f), function(ref) {
      cb(null, activityUid);
    });
  }
})

module.exports = 'sf.services.form';
