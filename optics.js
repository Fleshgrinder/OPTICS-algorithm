/*!
 * This file is part of Fleshgrinder/OPTICS-algorithm.
 *
 * Fleshgrinder/OPTICS-algorithm is free software: you can redistribute it and/or modify it under the terms of the GNU
 * Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * Fleshgrinder/OPTICS-algorithm is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
 * License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with Fleshgrinder/OPTICS-algorithm.
 * If not, see <https://www.gnu.org/licenses/agpl-3.0.html>.
 */

/**
 * OPTICS algorithm.
 *
 * @author Richard Fussenegger <richard@fussenegger.info>]
 * @copyright 2013 (c) Richard Fussenegger
 * @license https://www.gnu.org/licenses/agpl-3.0.html AGPL-3.0
 */

/**
 * Extend JavaScript's Math library with a round function that round with decimal points.
 *
 * @param {number} number
 *   The number that should be rounded.
 * @param {number} decimals
 *   Define how many decimal points you want.
 */
Math.roundFloat = function (number, decimals) {
  var multiplier = Math.pow(10, decimals);
  return Math.round(number * multiplier) / multiplier;
};

/**
 * Start of our actual script.
 */
$(document).ready(function () {
  var


    // ----------------------------------------------------------------------------------------------------------------- jQuery Properties


    $input = $('#input'),
    $minPoints = $('#min-points'),
    $coreDistance = $('#core-distance'),


    // ----------------------------------------------------------------------------------------------------------------- Properties


    distance = Infinity,
    distances = [],
    neighbors = {},
    objects = {},
    output = '',
    googleBubbleChartData = [
      ['ID', 'x', 'y', 'Core distance', 'Reachability']
    ],
    googleColumnChartData = [
      ['ID', 'Reachability']
    ],
    epsilon, inputLines, minPts, orderedSeed, tmpObj, tmpReachability,


    // ----------------------------------------------------------------------------------------------------------------- Methods


    /**
     * @class Priority queue implementation specific for our usecase.
     * @constructor
     * @type object
     */
    OrderedSeed = function () {
      var

        /**
         * Contains our object.
         *
         * @type array
         */
        _seed = [],

        /**
         * Sort our seed from low to high.
         *
         * @function
         */
        _sort = function () {
          _seed.sort(function (a, b) {
            if (a.reachabilityDistance === b.reachabilityDistance) {
              return b.name.localeCompare(a.name);
            }
            return b.reachabilityDistance - a.reachabilityDistance;
          });
        };

      return {

        /**
         * Insert a new object, or update the existing one if we have one.
         *
         * @function
         * @param {object} obj
         *   The object to insert into the seed.
         */
        insertOrUpdate: function (obj) {
          // Check if this object is already within our seed.
          for (var i = 0; i < _seed.length; i++) {
            if (_seed[i] !== undefined && obj.name === _seed[i].name) {
              _seed[i] = obj;
              _sort();
              return;
            }
          }

          // Insert the object into our seed if we couldn't update it.
          _seed.push(obj);
          _sort();
        },

        /**
         * @returns {number}
         *   The length of the seed.
         */
        length: function () {
          return _seed.length;
        },

        /**
         * Get object from offset.
         *
         * @param {number} offset
         *   Offset in the array.
         * @returns {object}
         *   The object at offset.
         */
        get: function (offset) {
          return _seed[offset];
        },

        /**
         * Removes and returns the next element in the seed.
         *
         * @function
         * @return {object}
         *   The next element within our seed.
         */
        pop: function () {
          return _seed.pop();
        }
      };
    },

    /**
     * Calculate reachability from object to each neighbor.
     *
     * @param {object} obj
     *   The object from which we should calculate the reachability.
     * @param {OrderedSeed} neighbors
     *   The neighbors of this object.
     */
    calculateReachability = function (obj, neighbors) {
      var neighbor;
      for (var i = 0; i < neighbors.length(); i++) {
        neighbor = neighbors.get(i);
        tmpReachability = Math.max(obj.coreDistance, obj[obj.name + '-' + neighbor.name]);
        neighbor.reachabilityDistance = Math.min(neighbor.reachabilityDistance, tmpReachability);
        orderedSeed.insertOrUpdate(neighbor);
      }
    },

    /**
     * Get all unprocessed neighbors.
     *
     * @param {object} obj
     *   The object for which we should find all unprocessed neighbors.
     * @return {object}
     *   All unprocessed neighbors within the core distance.
     */
    rangeQuery = function (obj) {
      var unprocessedNeighbors = OrderedSeed();

      if (obj === undefined) {
        return {};
      }

      $.each(objects, function (name, neighborObj) {
        if (neighborObj[neighborObj.name + '-' + obj.name] <= epsilon && !neighborObj.processed) {
          unprocessedNeighbors.insertOrUpdate(neighborObj);
        }
      });

      return unprocessedNeighbors;
    };


  // -------------------------------------------------------------------------------------------------------------------


  // If the user clicks on the checkbox, insert default values.
  $('#use-default-input,#input-label').click(function () {
    if ($input.val() === '') {
      $input.val(
        '40.00000 69.835013 A\n' +
        '78.0952367 153.64454 B\n' +
        '103.80952 138.406443 C\n' +
        '109.523813 161.26358 D\n' +
        '148.57143 129.835013 E\n' +
        '151.42857 187.9302567 F\n' +
        '94.2857167 186.025493 G\n' +
        '71.42857 60.311203 H\n' +
        '63.809523 174.596923 I\n' +
        '100.952383 154.596913 J\n' +
        '100.952383 197.45406 K'
      );
    } else {
      $input.val('');
    }
    $minPoints.val($minPoints.val() === '' ? 3 : '');
    $coreDistance.val($coreDistance.val() === '' ? 100 : '');
  });


  // -------------------------------------------------------------------------------------------------------------------

  $('#form').fadeIn('slow').submit(function (event) {
    // Prevent submission of the form.
    event.preventDefault();

    // Snatch the input values.
    inputLines = $input.val().split('\n');
    minPts = parseInt($minPoints.val(), 10);
    epsilon = parseInt($coreDistance.val(), 10);

    // Remove the input mask with a nice loading animation.
    $(this).fadeOut('slow', function () {
      $('#processing').fadeIn('slow', function () {
        // Process each line of our input and create a huge object of it.
        $.each(inputLines, function (delta, line) {
          var properties = line.split(' ');
          objects[properties[2]] = {
            name: properties[2],
            x: parseFloat(properties[0], 10),
            y: parseFloat(properties[1], 10),
            coreDistance: Infinity,
            reachabilityDistance: Infinity
          };
        });

        // Calculate euclid and core distance for each object.
        $.each(objects, function (name1, obj1) {
          distances = [];

          $.each(objects, function (name2, obj2) {
            // No need to process ourself!
            if (name1 === name2) {
              objects[name1][name1 + '-' + name2] = Infinity;
              return;
            }

            // Calculate euclidean distance for this pair, or use the already calculated value.
            distance = objects[name1][name1 + '-' + name2] = objects[name2][name2 + '-' + name1] !== undefined ?
              objects[name2][name2 + '-' + name1] : Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));

            // Add this distance to our distances array if it's within the core distance range.
            if (distance <= epsilon) {
              distances.push({ name: name2, distance: distance });
            }
          });

          // Only calculate core distance if this is a core point.
          if (distances.length >= minPts) {
            // Sort our array and get the maximum value from our minimum point.
            objects[name1].coreDistance = distances.sort(function (a, b) {
              return a.distance - b.distance;
            })[minPts - 1].distance;

            // Prepare the output.
            output +=
              '<p class="indent"><span class="core-name">' + name1 + '</span> ↦ <span class="core-value">' +
              Math.roundFloat(objects[name1].coreDistance, 2) + '</span></p>';
          }
        });
        $('#core-distances-output').html(output);
        output = '';

        // Start OPTICS algorithm. This is a straight forward implementation of the algorithm as found in the paper.
        $.each(objects, function (name, obj) {
          if (obj.processed) {
            return;
          }

          orderedSeed = OrderedSeed();

          neighbors = rangeQuery(obj);

          obj.processed = true;

          output +=
            '<p class="indent">' +
              '<span class="core-name">' + name + '</span> ' +
              '<span class="core-value">' + Math.roundFloat(obj.reachabilityDistance, 2) + '</span> ' +
              '<span class="core-value">' + Math.roundFloat(obj.coreDistance, 2) + '</span>' +
            '</p>'
          ;

          if (obj.coreDistance !== Infinity) {
            calculateReachability(obj, neighbors);

            for (var i = 0; i < orderedSeed.length(); i++) {
              tmpObj = orderedSeed.pop();

              neighbors = rangeQuery(tmpObj);

              tmpObj.processed = true;

              output +=
                '<p class="indent">' +
                  '<span class="core-name">' + tmpObj.name + '</span> ' +
                  '<span class="core-value">' + Math.roundFloat(tmpObj.reachabilityDistance, 2) + '</span> ' +
                  '<span class="core-value">' + Math.roundFloat(tmpObj.coreDistance, 2) + '</span>' +
                '</p>'
              ;

              if (tmpObj.coreDistance !== Infinity) {
                calculateReachability(tmpObj, neighbors);
              }

              objects[tmpObj.name] = tmpObj;
            }
          }

          objects[name] = obj;
        });
        $('#reachability-output').html(output);
        output = '';

        // Start preperation of the bubble chart.
        $.each(objects, function (name, object) {
          googleBubbleChartData.push([
            name, object.x, object.y, object.reachabilityDistance === Infinity ? 0 : object.reachabilityDistance, object.coreDistance
          ]);
          googleColumnChartData.push([name, object.reachabilityDistance]);
        });

        // Create chart and add it to the DOM.
        new google.visualization.BubbleChart(document.getElementById('google-bubble-chart')).draw(
          google.visualization.arrayToDataTable(googleBubbleChartData),
          {
            width: $('#wrapper').width(),
            height: $('#wrapper').width(),
            chartArea: { width: '70%', height: '70%' },
            fontName: '"Open Sans Condensed"',
            hAxis: { title: 'x position' },
            vAxis: { title: 'y position' }
          }
        );
        new google.visualization.ColumnChart(document.getElementById('google-column-chart')).draw(
          google.visualization.arrayToDataTable(googleColumnChartData),
          {
            width: $('#wrapper').width(),
            height: $('#wrapper').width(),
            fontName: '"Open Sans Condensed"',
            legend: null
          }
        );

        $(this).fadeOut('slow', function () {
          $('#output').fadeIn('slow');
        });
      });
    });
  });


});
