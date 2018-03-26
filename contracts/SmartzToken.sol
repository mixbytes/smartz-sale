pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/StandardToken.sol';
import 'mixbytes-solidity/contracts/ownership/multiowned.sol';


/// @title Utility interface for approveAndCall token function.
interface IApprovalRecipient {
    /**
     * @notice Signals that token holder approved spending of tokens and some action should be taken.
     *
     * @param _sender token holder which approved spending of his tokens
     * @param _value amount of tokens approved to be spent
     * @param _extraData any extra data token holder provided to the call
     *
     * @dev warning: implementors should validate sender of this message (it should be the token) and make no further
     *      assumptions unless validated them via ERC20 methods.
     */
    function receiveApproval(address _sender, uint256 _value, bytes _extraData) public;
}


contract SmartzToken is multiowned, StandardToken {

    event Burn(address indexed from, uint256 amount);


    // PUBLIC FUNCTIONS

    /**
     * @notice Constructs token.
     *
     * @param _initialOwners initial multi-signatures, see comment below
     * @param _signaturesRequired quorum of multi-signatures
     *
     * Initial owners have power over the token contract only during bootstrap phase (early investments and token
     * sales). To be precise, the owners can set KYC provider and sales (which can freeze transfered tokens) during
     * bootstrap phase. After final token sale any control over the token removed by issuing detachOwners call.
     * For lifecycle example please see test/SmartzTokenTest.js, 'test full lifecycle'.
     */
    function SmartzToken(address[] _initialOwners, uint _signaturesRequired)
        public
        multiowned(_initialOwners, _signaturesRequired)
    {
        totalSupply = MAX_SUPPLY;
        balances[msg.sender] = totalSupply;
        Transfer(address(0), msg.sender, totalSupply);
    }

    /**
     * Function to burn msg.sender's tokens.
     *
     * @param _amount The amount of tokens to burn
     *
     * @return A boolean that indicates if the operation was successful.
     */
    function burn(uint256 _amount) public returns (bool) {
        address from = msg.sender;
        require(_amount > 0);
        require(_amount <= balances[from]);

        totalSupply = totalSupply.sub(_amount);
        balances[from] = balances[from].sub(_amount);
        Burn(from, _amount);
        Transfer(from, address(0), _amount);

        return true;
    }

    /**
     * @notice Approves spending tokens and immediately triggers token recipient logic.
     *
     * @param _spender contract which supports IApprovalRecipient and allowed to receive tokens
     * @param _value amount of tokens approved to be spent
     * @param _extraData any extra data which to be provided to the _spender
     *
     * By invoking this utility function token holder could do two things in one transaction: approve spending his
     * tokens and execute some external contract which spends them on token holder's behalf.
     * It can't be known if _spender's invocation succeed or not.
     * This function will throw if approval failed.
     */
    function approveAndCall(address _spender, uint256 _value, bytes _extraData) public {
        require(approve(_spender, _value));
        IApprovalRecipient(_spender).receiveApproval(msg.sender, _value, _extraData);
    }


    // ADMINISTRATIVE FUNCTIONS




    // FIELDS




    // CONSTANTS

    string public constant name = "Smartz token";
    string public constant symbol = "SMR";
    uint8 public constant decimals = 18;

    uint public constant MAX_SUPPLY = uint(150) * uint(1000000) * uint(10) ** uint(decimals);
}
