var profanityFilter = require('./../../common/services/profanity-filter/');
var game = require('./../../common/services/game/');

var fs = require('fs');

angular.module('sf.game', [
    'ui.router',
    profanityFilter
  ])

  .config(function($stateProvider) {
    $stateProvider
      .state('sf.game', {
        url: '/games?uid&sid',
        resolve: {
          currentGame: function(Game, User) {
            return Game.getGameByUser(User);
          }
        },
        views: {
          'content@': {
            template: fs.readFileSync(__dirname + "/game.tpl.html"),
            controller: 'GameCtrl as game'
          }
        }
      });
  })

  .controller('GameCtrl', function(Game, currentGame, User, ProfanityFilter){
    var game = this;

    game.currentGame = currentGame;

    game.currentGame.sentenceModel = "";
    game.currentGame.oldSentenceModel = "";

    game.closeGame = function() {
      var gameId = game.currentGame.$id;
      Game.closeGame(gameId);
    };

    game.getCurrentSentence = function() {
      return game.currentGame.sentenceModel;
    }

    game.submitEntry = function() {
      //do some validation here
      var sentence = game.getCurrentSentence();
      console.log(sentence);
      var errors = game.validateSentence(sentence);
      if (errors.length === 0) {
        Game.sendSentence(game.currentGame.$id, sentence);
        Game.logWords(game.currentGame.$id, game.currentGame, sentence);
        game.currentGame.newSentence = "";
        Game.takeTurns(game.currentGame.$id);
      } else {
        game.showErrors(errors);
      }

    }

    game.validateSentence = function(sentence) {
      var errors = [];
      var profane = ProfanityFilter.checkSentence(sentence);
      if (profane) {
        errors.push(profane);
      }
      return errors;
    };

    game.showErrors = function(errors) {
      var eString = [];
      errors.forEach(function(err) {
        err.forEach(function(errString) {
          eString.push(errString);
        });
      });

      alert(eString.join("\n"))
    };

    game.isLocalPlayersTurn = function() {
      var users = game.currentGame.users;
      if (users) {
        var userInControl;
        for (var i in users) {
          if (users[i].isTheirTurn) {
            userInControl = users[i];
            break;
          }
        }
        return userInControl.name === User.localUser;
      }
      return false;
    }

    game.isWordUsed = function(word) {
      for (var i in game.currentGame.wordsUsed) {
        if (word === game.currentGame.wordsUsed[i]) {
          return true;
        }
      }
      return false;
    }
  })

;

module.exports = 'sf.game';
