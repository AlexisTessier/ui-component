'use strict';

var task = require('@alexistessier/gulp-workflow-common-task');

task.babel('es6-for-node');

task.build();
task.watch();

task.default('build');