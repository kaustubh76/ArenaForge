// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/game-modes/QuizBowl.sol";

contract QuizBowlTest is Test {
    QuizBowl public quiz;

    address public arenaAgent = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);

    uint256 constant MATCH_ID = 1;
    uint256 constant TOTAL_QUESTIONS = 3;
    uint256 constant MAX_ANSWER_TIME = 60;

    function setUp() public {
        quiz = new QuizBowl(arenaAgent);
    }

    // -------------------------------------------------------
    // Helpers
    // -------------------------------------------------------

    function _initDefaultMatch() internal {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;
        quiz.initMatch(MATCH_ID, players, TOTAL_QUESTIONS, MAX_ANSWER_TIME);
    }

    function _commitHash(uint256 answer, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(answer, salt));
    }

    // -------------------------------------------------------
    // 1. test_InitMatch
    // -------------------------------------------------------

    function test_InitMatch() public {
        _initDefaultMatch();

        address[] memory players = quiz.getPlayers(MATCH_ID);
        assertEq(players.length, 2);
        assertEq(players[0], player1);
        assertEq(players[1], player2);
        assertEq(quiz.getCurrentQuestion(MATCH_ID), 0);
    }

    // -------------------------------------------------------
    // 2. test_PostQuestion
    // -------------------------------------------------------

    function test_PostQuestion() public {
        _initDefaultMatch();

        bytes32 qHash = keccak256("What is 2+2?");
        quiz.postQuestion(MATCH_ID, qHash);

        assertEq(quiz.getCurrentQuestion(MATCH_ID), 1);

        (bytes32 storedHash, , uint256 deadline, ) = quiz.questions(MATCH_ID, 1);
        assertEq(storedHash, qHash);
        assertEq(deadline, block.timestamp + MAX_ANSWER_TIME);
    }

    // -------------------------------------------------------
    // 3. test_CommitRevealAnswer
    // -------------------------------------------------------

    function test_CommitRevealAnswer() public {
        _initDefaultMatch();

        bytes32 qHash = keccak256("What is 2+2?");
        quiz.postQuestion(MATCH_ID, qHash);

        uint256 answer = 4;
        bytes32 salt = bytes32("mysalt");
        bytes32 answerHash = _commitHash(answer, salt);

        // Commit
        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, answerHash);

        (bytes32 storedAnswerHash, , , bool committed, , , ) = quiz.answers(MATCH_ID, 1, player1);
        assertEq(storedAnswerHash, answerHash);
        assertTrue(committed);

        // Reveal
        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 1, answer, salt);

        (, uint256 revealedAnswer, , , bool revealed, , ) = quiz.answers(MATCH_ID, 1, player1);
        assertEq(revealedAnswer, answer);
        assertTrue(revealed);
    }

    // -------------------------------------------------------
    // 4. test_ResolveCorrectAnswer
    // -------------------------------------------------------

    function test_ResolveCorrectAnswer() public {
        _initDefaultMatch();

        bytes32 qHash = keccak256("What is 2+2?");
        quiz.postQuestion(MATCH_ID, qHash);

        uint256 correctAnswer = 4;
        bytes32 salt = bytes32("salt1");
        bytes32 answerHash = _commitHash(correctAnswer, salt);

        // Player1 commits and reveals the correct answer
        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, answerHash);

        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 1, correctAnswer, salt);

        // Resolve the question
        quiz.resolveQuestion(MATCH_ID, 1, correctAnswer);

        // Verify score > 0 (base 100 + speed bonus up to 50)
        uint256 score = quiz.getScore(MATCH_ID, player1);
        assertGt(score, 0);
        assertGe(score, 100); // at least base score
        assertLe(score, 150); // at most base + max speed bonus

        // Verify answer marked correct
        (, , , , , bool correct, uint256 answerScore) = quiz.answers(MATCH_ID, 1, player1);
        assertTrue(correct);
        assertEq(answerScore, score);
    }

    // -------------------------------------------------------
    // 5. test_ResolveWrongAnswer
    // -------------------------------------------------------

    function test_ResolveWrongAnswer() public {
        _initDefaultMatch();

        bytes32 qHash = keccak256("What is 2+2?");
        quiz.postQuestion(MATCH_ID, qHash);

        uint256 wrongAnswer = 5;
        uint256 correctAnswer = 4;
        bytes32 salt = bytes32("salt1");
        bytes32 answerHash = _commitHash(wrongAnswer, salt);

        // Player1 commits and reveals the wrong answer
        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, answerHash);

        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 1, wrongAnswer, salt);

        // Resolve with the correct answer
        quiz.resolveQuestion(MATCH_ID, 1, correctAnswer);

        // Score stays 0
        uint256 score = quiz.getScore(MATCH_ID, player1);
        assertEq(score, 0);

        (, , , , , bool correct, uint256 answerScore) = quiz.answers(MATCH_ID, 1, player1);
        assertFalse(correct);
        assertEq(answerScore, 0);
    }

    // -------------------------------------------------------
    // 6. test_MultipleQuestions
    // -------------------------------------------------------

    function test_MultipleQuestions() public {
        _initDefaultMatch();

        uint256 correctAnswer1 = 4;
        uint256 correctAnswer2 = 7;
        bytes32 salt = bytes32("salt1");

        // Question 1
        quiz.postQuestion(MATCH_ID, keccak256("Q1"));

        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, _commitHash(correctAnswer1, salt));

        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 1, correctAnswer1, salt);

        quiz.resolveQuestion(MATCH_ID, 1, correctAnswer1);

        uint256 scoreAfterQ1 = quiz.getScore(MATCH_ID, player1);
        assertGt(scoreAfterQ1, 0);

        // Question 2
        quiz.postQuestion(MATCH_ID, keccak256("Q2"));

        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 2, _commitHash(correctAnswer2, salt));

        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 2, correctAnswer2, salt);

        quiz.resolveQuestion(MATCH_ID, 2, correctAnswer2);

        uint256 scoreAfterQ2 = quiz.getScore(MATCH_ID, player1);
        assertGt(scoreAfterQ2, scoreAfterQ1);

        // Accumulated score should be at least 200 (two base scores)
        assertGe(scoreAfterQ2, 200);
    }

    // -------------------------------------------------------
    // 7. test_SpeedBonus
    // -------------------------------------------------------

    function test_SpeedBonus() public {
        _initDefaultMatch();

        uint256 correctAnswer = 42;
        bytes32 salt1 = bytes32("salt_p1");
        bytes32 salt2 = bytes32("salt_p2");

        quiz.postQuestion(MATCH_ID, keccak256("Speed Q"));

        uint256 questionPostedAt = block.timestamp;

        // Player1 answers immediately (0 seconds elapsed -> max speed bonus)
        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, _commitHash(correctAnswer, salt1));

        vm.prank(player1);
        quiz.revealAnswer(MATCH_ID, 1, correctAnswer, salt1);

        // Warp forward 55 seconds so player2 answers late (55 of 60 seconds used)
        vm.warp(questionPostedAt + 55);

        vm.prank(player2);
        quiz.commitAnswer(MATCH_ID, 1, _commitHash(correctAnswer, salt2));

        vm.prank(player2);
        quiz.revealAnswer(MATCH_ID, 1, correctAnswer, salt2);

        // Resolve
        quiz.resolveQuestion(MATCH_ID, 1, correctAnswer);

        uint256 score1 = quiz.getScore(MATCH_ID, player1);
        uint256 score2 = quiz.getScore(MATCH_ID, player2);

        // Player1 answered faster so should have higher score
        assertGt(score1, score2);

        // Player1: base 100 + speed bonus 50 = 150 (answered at time 0, full remaining)
        assertEq(score1, 150);

        // Player2: base 100 + speed bonus ~4 (5 seconds remaining out of 60)
        // speedBonus = (5 * 50) / 60 = 4
        assertEq(score2, 104);
    }

    // -------------------------------------------------------
    // 8. test_Revert_CommitNotPlayer
    // -------------------------------------------------------

    function test_Revert_CommitNotPlayer() public {
        _initDefaultMatch();

        quiz.postQuestion(MATCH_ID, keccak256("Q1"));

        bytes32 answerHash = _commitHash(42, bytes32("salt"));

        vm.prank(address(0x99));
        vm.expectRevert("Not a player");
        quiz.commitAnswer(MATCH_ID, 1, answerHash);
    }

    // -------------------------------------------------------
    // 9. test_Revert_CommitAfterDeadline
    // -------------------------------------------------------

    function test_Revert_CommitAfterDeadline() public {
        _initDefaultMatch();

        quiz.postQuestion(MATCH_ID, keccak256("Q1"));

        // Warp past the deadline (60 seconds + 1)
        vm.warp(block.timestamp + MAX_ANSWER_TIME + 1);

        bytes32 answerHash = _commitHash(42, bytes32("salt"));

        vm.prank(player1);
        vm.expectRevert("Deadline passed");
        quiz.commitAnswer(MATCH_ID, 1, answerHash);
    }

    // -------------------------------------------------------
    // 10. test_Revert_RevealHashMismatch
    // -------------------------------------------------------

    function test_Revert_RevealHashMismatch() public {
        _initDefaultMatch();

        quiz.postQuestion(MATCH_ID, keccak256("Q1"));

        uint256 answer = 42;
        bytes32 correctSalt = bytes32("correct_salt");
        bytes32 wrongSalt = bytes32("wrong_salt");

        // Commit with the correct salt
        vm.prank(player1);
        quiz.commitAnswer(MATCH_ID, 1, _commitHash(answer, correctSalt));

        // Reveal with the wrong salt -> hash mismatch
        vm.prank(player1);
        vm.expectRevert("Hash mismatch");
        quiz.revealAnswer(MATCH_ID, 1, answer, wrongSalt);
    }

    // -------------------------------------------------------
    // 11. test_Revert_UnauthorizedInit
    // -------------------------------------------------------

    function test_Revert_UnauthorizedInit() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;

        vm.prank(address(0x99));
        vm.expectRevert("Only arena agent");
        quiz.initMatch(MATCH_ID, players, TOTAL_QUESTIONS, MAX_ANSWER_TIME);
    }

    // -------------------------------------------------------
    // 12. test_Revert_TooManyQuestions
    // -------------------------------------------------------

    function test_Revert_TooManyQuestions() public {
        _initDefaultMatch();

        // Post all 3 allowed questions
        quiz.postQuestion(MATCH_ID, keccak256("Q1"));
        quiz.postQuestion(MATCH_ID, keccak256("Q2"));
        quiz.postQuestion(MATCH_ID, keccak256("Q3"));

        assertEq(quiz.getCurrentQuestion(MATCH_ID), 3);

        // Attempting a 4th question should revert
        vm.expectRevert("All questions posted");
        quiz.postQuestion(MATCH_ID, keccak256("Q4"));
    }
}
