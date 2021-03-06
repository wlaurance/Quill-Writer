var sfConstants = require('../../constants');
var sfEmpirical = require('../empirical');

angular.module("sf.services.game", [
    sfConstants,
    sfEmpirical,
  ])

  /*
   * The Game is service is responsible for initializing games
   */
  .service("Game", function($firebase, baseFbUrl, Empirical, _, $analytics) {
    var gameModel = this;

    var gamesRef = new Firebase(baseFbUrl + "/games");

    gameModel.get = function(id) {
      return $firebase(gameModel.getRef(id));
    };

    gameModel.getRef = function(id) {
      return gamesRef.child(id);
    }

    /*
     * getGameByUser is essentially a init like function. It is based an
     * Angular scope and all of the firebase refs are attached to it.
     * This auto syncs current games in progress. It creates new users
     * if required. It establishes some watch functions that update the messages
     * on certain events.
     */
    gameModel.getGameByUser = function(User, $scope) {
      var currentUser = User.currentUser;
      var gameRef = gameModel.getRef(currentUser.sid);
      var gameUsersRef = gameRef.child("users");
      var gameUsers = $firebase(gameUsersRef).$asArray();
      function makeNewUser(length) {
        currentUser.name = "Player " + String(length + 1);
        currentUser.done = false;
        currentUser.isTheirTurn = currentUser.name === "Player 1";
        currentUser.leader = currentUser.name === "Player 1";
        User.localUser = currentUser.name;
        gameUsers.$add(currentUser).then(function(newUserRef) {
          gameUsers.$loaded(function() {
            var userFinishMessageToShow = $firebase(newUserRef.child("finishMessageToShow")).$asObject();
            userFinishMessageToShow.message = "";
            userFinishMessageToShow.$watch(function() {
              $scope.finishMessageToShow = userFinishMessageToShow.message;
            });
            userFinishMessageToShow.$save().then(function() {
              var newUser = gameUsers.$getRecord(newUserRef.name());
              newUser.finishMessageToShow = userFinishMessageToShow;
              gameUsers.$save(newUser);
              User.setCurrentUser(newUser);
            })
          });
        });
        User.setCurrentUser(currentUser);
      }
      function findCurrentUser() {
        return _.find(gameUsers, function(gameUser) {
          return gameModel.isSameUser(gameUser, currentUser);
        });
      }
      gameUsers.$loaded(function() {
        var length = gameUsers.length;
        var gameUser = findCurrentUser();
        if (gameUser) {
          currentUser = gameUser;
          User.localUser = currentUser.name;
        } else if (length < 2) {
          makeNewUser(length)
        }
        //We pass everything to initialize game
        //This is where the game prompts, word lists, requirements are loaded
        Empirical.initializeGame($scope, gameUsers, currentUser);
      }).then(function() {
        $scope.users = gameUsers;
      });
      var wordsUsed = $firebase(gameRef.child("wordsUsed")).$asArray();
      var sentences = $firebase(gameRef.child("sentences")).$asArray();
      var wordsUsedLength = $firebase(gameRef.child("wordsUsedLength")).$asObject();
      wordsUsedLength.$loaded(function() {
        if (!wordsUsedLength.length) {
          wordsUsedLength.length = 0;
          wordsUsedLength.$save();
        }
      });
      wordsUsed.$watch(function() {
        wordsUsedLength.$loaded(function() {
          wordsUsedLength.length = wordsUsed.length;
          wordsUsedLength.$save();
        });
      });
      $scope.wordsUsedLength = wordsUsedLength;
      $scope.wordsUsed = wordsUsed;
      $scope.sentences = sentences;
      return $scope;
    };

    //This returns a finished game for the summary page.
    gameModel.getFinishedGame = function(gameId) {
      var game = gameModel.get(gameId).$asObject();
      var gameRef = gameModel.getRef(gameId);
      var wordsUsed = $firebase(gameRef.child("wordsUsed")).$asArray();
      var sentences = $firebase(gameRef.child("sentences")).$asArray();
      var wordsUsedLength = $firebase(gameRef.child("wordsUsedLength")).$asObject();
      var gameUsers = $firebase(gameRef.child("users")).$asArray();
      game.wordsUsedLength = wordsUsed;
      game.sentences = sentences;
      game.wordsUsedLength = wordsUsedLength;
      game.users = gameUsers;
      game.users.$loaded().then(function() {
        var activityUID = game.users[0].activityPrompt;
        Empirical.loadFinishedGame(game, activityUID);
      });
      return game;
    };

    gameModel.getSentences = function(gameId) {
      return $firebase(gameModel.getRef(gameId).child("sentences")).$asArray();
    }

    gameModel.closeGame = function(gameId, currentUser) {
      if (currentUser.leader) {
        $analytics.eventTrack('Quill-Writer Submit Story to Teacher');
      }
    };

    gameModel.sendSentence = function(gameId, currentGame, sentence, currentUser) {
      sentence = gameModel.highlightWords(gameId, currentGame, sentence);
      sentence = gameModel.appendExtraSpaceIfNeccessary(sentence);
      gameModel.getSentences(gameId).$add({entry: sentence, user: currentUser});
    };

    gameModel.appendExtraSpaceIfNeccessary = function(sentence) {
      var tokens = sentence.split('');
      if (tokens[tokens.length - 1] !== " ") {
        tokens.push(" ");
      }
      return tokens.join('');
    }

    gameModel.highlightWords = function(gameId, currentGame, sentence) {
      var wordsToUse = currentGame.wordList;
      _.each(wordsToUse, function(w) {
        var exp = new RegExp("(" + w.word + ")", "gi");
        sentence = sentence.replace(exp, '<b>$1</b>');
      })
      return sentence;
    }

    /*
     * Toggles the isTheirTurn property on each user.
     * This only works for two player games. If we ever expand to more
     * players, this logic needs to change.
     * TODO
     */
    gameModel.takeTurns = function(gameId) {
      var game = gameModel.getRef(gameId);
      var users = $firebase(game.child("users")).$asArray();
      users.$loaded().then(function(){
        angular.forEach(users, function(user) {
          user.isTheirTurn = !user.isTheirTurn;
          users.$save(user);
        });
      });
    }

    gameModel.isSameUser = function(u1, u2) {
      return ((u1.sid === u2.sid) && (u1.uid === u2.uid));
    }

    gameModel.imDone = function(gameId, currentGame, currentUser, onDone) {
      var game = gameModel.getRef(gameId);
      var users = $firebase(game.child("users")).$asArray();
      users.$loaded().then(function(){
        angular.forEach(users, function(user) {
          if (gameModel.isSameUser(user, currentUser)) {
            user.done = true
            user.finishMessageToShow.message = "You have submitted the story. Waiting for the other player to approve.";
            user.isTheirTurn = false;
          } else {
            user.finishMessageToShow.message = "The other player has voted to submit to the story. Press submit to teacher when you feel the story is complete. You may continue to use words.";
            user.isTheirTurn = true;
          }
          var gameObj = $firebase(game).$asObject();
          var unwatch = gameObj.$watch(function() {
            console.log(unwatch);
            if (gameObj.isDone) {
              onDone();
              unwatch();
            }
          })
          users.$save(user).then(function() {
            users.$loaded().then(function() {
              var allDone = true;
              angular.forEach(users, function(user) {
                if (allDone && !user.done) {
                  allDone = false;
                }
              });
              if (allDone) {
                angular.forEach(users, function(user) {
                  user.finishMessageToShow.message = "You have completed this story!";
                  users.$save(user);
                  var isDone = $firebase(game.child("isDone")).$asObject();
                  isDone.value = true;
                  isDone.$save();
                });
                gameModel.closeGame(gameId, currentUser);
              }
            });
          });
        });
      });
    }

    gameModel.onBothPlayersReady = function(gameId, cb) {
      var game = gameModel.getRef(gameId);
      var users = $firebase(game.child("users")).$asArray();
      users.$loaded().then(function(){
        if (users.length >= 2) {
          cb();
        } else {
          var unwatch = users.$watch(function() {
            if (users.length >= 2) {
              cb();
              unwatch();
            }
          });
        }
      });
    };

    gameModel.onOtherPlayerSubmission = function(gameId, currentUser, cb) {
      var sentences = gameModel.getSentences(gameId);
      sentences.$watch(function(e) {
        if (e.event === "child_added") {
          var sentence = sentences.$getRecord(e.key);
          if (sentence) {
            var sUser = sentence.user;
            if (!gameModel.isSameUser(currentUser, sUser)) {
              cb(sentence.entry);
            }
          }
        }
      });
    };

    /**
     * TODO This contains logic that assumes two players.
     */
    gameModel.ensureItIsSomeonesTurn = function(gameId) {
      var game = gameModel.getRef(gameId);
      var users = $firebase(game.child("users")).$asArray();
      users.$loaded().then(function(){
        var isSomeonesTurn = false;
        _.each(users, function(u) {
          if (u.isTheirTurn) {
            isSomeonesTurn = u.isTheirTurn;
          }
        });
        if (!isSomeonesTurn) {
          var sentences = gameModel.getSentences(gameId);
          sentences.$loaded().then(function() {
            var index = 0;
            if (sentences.length > 0) {
              index = 1;
            }
            var user = users[index];
            user.isTheirTurn = true;
            users.$save(user);
          });
        }
      });
    }

    gameModel.logWords = function(gameId, currentGame, sentence) {
      var gameRef = gameModel.getRef(gameId);
      var wordsUsed = $firebase(gameRef.child("wordsUsed")).$asArray();
      var wordsToUse = currentGame.wordList;
      var wordsInSentence = sentence.split(" ");
      var wordsToAdd = [];
      var normalizedSentence = sentence.toLowerCase();
      _.each(wordsToUse, function(wordToUse) {
        var wordToUseNormalized = wordToUse.word.toLowerCase();
        var tokens = normalizedSentence.split(wordToUseNormalized);
        if (tokens.length > 1) {
          wordsToAdd.push(wordToUse.word);
        }
      });
      wordsInSentence.forEach(function(cased_word) {
        var word = cased_word.toLowerCase();
        for (var i = 0; i < wordsToUse.length; i++) {
          var wordToLookAt = wordsToUse[i].word.toLowerCase();
          if (word === wordToLookAt || word.indexOf(wordToLookAt) !== -1) {
            wordsToAdd.push(wordsToUse[i].word);
          }
        }
      });
      wordsUsed.$loaded(function() {
        var uniqueWordsToAdd = _.uniq(wordsToAdd);
        if (wordsUsed.length === 0 && uniqueWordsToAdd.length > 0) {
          $analytics.eventTrack('Quill-Writer Story Word Used', { wordUsed : uniqueWordsToAdd[0] });
        }
        _.each(uniqueWordsToAdd, function(word) {
          wordsUsed.$add(word);
        });
      });
    }

    gameModel.flagSentenceForReview = function(gameId, currentUser, sentence, cb) {
      cb();
    };
  })

;

module.exports = 'sf.services.game';
