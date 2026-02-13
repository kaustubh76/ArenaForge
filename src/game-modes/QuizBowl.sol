// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract QuizBowl {
    address public arenaAgent;

    struct Question {
        bytes32 questionHash;
        uint256 correctAnswer;
        uint256 deadline;
        bool resolved;
    }

    struct Answer {
        bytes32 answerHash;
        uint256 revealedAnswer;
        uint256 submitTimestamp;
        bool committed;
        bool revealed;
        bool correct;
        uint256 score;
    }

    struct MatchState {
        address[] players;
        uint256 totalQuestions;
        uint256 currentQuestion;
        mapping(address => uint256) totalScores;
        uint256 maxAnswerTime;
        bool initialized;
    }

    mapping(uint256 => MatchState) internal _matchStates;
    mapping(uint256 => mapping(uint256 => Question)) public questions;
    mapping(uint256 => mapping(uint256 => mapping(address => Answer))) public answers;

    event MatchInitialized(uint256 indexed matchId, uint256 totalQuestions);
    event QuestionPosted(uint256 indexed matchId, uint256 questionIndex, bytes32 questionHash, uint256 deadline);
    event AnswerCommitted(uint256 indexed matchId, uint256 questionIndex, address player);
    event AnswerRevealed(uint256 indexed matchId, uint256 questionIndex, address player, uint256 answer);
    event QuestionResolved(uint256 indexed matchId, uint256 questionIndex, uint256 correctAnswer);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function initMatch(
        uint256 matchId,
        address[] calldata players,
        uint256 totalQuestions,
        uint256 maxAnswerTime
    ) external onlyArenaAgent {
        require(!_matchStates[matchId].initialized, "Already initialized");
        require(players.length >= 2, "Need at least 2 players");

        MatchState storage state = _matchStates[matchId];
        state.players = players;
        state.totalQuestions = totalQuestions;
        state.currentQuestion = 0;
        state.maxAnswerTime = maxAnswerTime;
        state.initialized = true;

        emit MatchInitialized(matchId, totalQuestions);
    }

    function postQuestion(uint256 matchId, bytes32 questionHash) external onlyArenaAgent {
        MatchState storage state = _matchStates[matchId];
        require(state.initialized, "Not initialized");

        state.currentQuestion++;
        require(state.currentQuestion <= state.totalQuestions, "All questions posted");

        questions[matchId][state.currentQuestion] = Question({
            questionHash: questionHash,
            correctAnswer: 0,
            deadline: block.timestamp + state.maxAnswerTime,
            resolved: false
        });

        emit QuestionPosted(matchId, state.currentQuestion, questionHash, block.timestamp + state.maxAnswerTime);
    }

    function commitAnswer(uint256 matchId, uint256 questionIndex, bytes32 answerHash) external {
        require(_isPlayer(matchId, msg.sender), "Not a player");

        Question storage q = questions[matchId][questionIndex];
        require(q.questionHash != bytes32(0), "Question not found");
        require(!q.resolved, "Question resolved");
        require(block.timestamp <= q.deadline, "Deadline passed");

        Answer storage a = answers[matchId][questionIndex][msg.sender];
        require(!a.committed, "Already committed");

        a.answerHash = answerHash;
        a.submitTimestamp = block.timestamp;
        a.committed = true;

        emit AnswerCommitted(matchId, questionIndex, msg.sender);
    }

    function revealAnswer(uint256 matchId, uint256 questionIndex, uint256 answer, bytes32 salt) external {
        Answer storage a = answers[matchId][questionIndex][msg.sender];
        require(a.committed, "Not committed");
        require(!a.revealed, "Already revealed");

        bytes32 expectedHash = keccak256(abi.encodePacked(answer, salt));
        require(a.answerHash == expectedHash, "Hash mismatch");

        a.revealedAnswer = answer;
        a.revealed = true;

        emit AnswerRevealed(matchId, questionIndex, msg.sender, answer);
    }

    function resolveQuestion(uint256 matchId, uint256 questionIndex, uint256 correctAnswer) external onlyArenaAgent {
        Question storage q = questions[matchId][questionIndex];
        require(!q.resolved, "Already resolved");

        q.correctAnswer = correctAnswer;
        q.resolved = true;

        MatchState storage state = _matchStates[matchId];

        for (uint256 i = 0; i < state.players.length; i++) {
            address player = state.players[i];
            Answer storage a = answers[matchId][questionIndex][player];

            if (a.revealed && a.revealedAnswer == correctAnswer) {
                a.correct = true;
                uint256 baseScore = 100;

                // Speed bonus: up to 50 points based on time remaining
                uint256 timeUsed = a.submitTimestamp > (q.deadline - state.maxAnswerTime)
                    ? a.submitTimestamp - (q.deadline - state.maxAnswerTime)
                    : 0;
                uint256 timeRemaining = state.maxAnswerTime > timeUsed ? state.maxAnswerTime - timeUsed : 0;
                uint256 speedBonus = (timeRemaining * 50) / state.maxAnswerTime;

                a.score = baseScore + speedBonus;
                state.totalScores[player] += a.score;
            }
        }

        emit QuestionResolved(matchId, questionIndex, correctAnswer);
    }

    function getScore(uint256 matchId, address player) external view returns (uint256) {
        return _matchStates[matchId].totalScores[player];
    }

    function getPlayers(uint256 matchId) external view returns (address[] memory) {
        return _matchStates[matchId].players;
    }

    function getCurrentQuestion(uint256 matchId) external view returns (uint256) {
        return _matchStates[matchId].currentQuestion;
    }

    function _isPlayer(uint256 matchId, address player) internal view returns (bool) {
        address[] storage players = _matchStates[matchId].players;
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == player) return true;
        }
        return false;
    }
}
