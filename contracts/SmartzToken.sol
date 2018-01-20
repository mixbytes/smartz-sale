pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/StandardToken.sol';


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


contract SmartzToken is StandardToken {

    event Burn(address indexed from, uint256 amount);


    // PUBLIC

    function SmartzToken() public {
        totalSupply = INITIAL_SUPPLY;
        balances[msg.sender] = INITIAL_SUPPLY;
        Transfer(address(0), msg.sender, INITIAL_SUPPLY);
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
     */
    function approveAndCall(address _spender, uint256 _value, bytes _extraData) public {
        approve(_spender, _value);
        IApprovalRecipient(_spender).receiveApproval(msg.sender, _value, _extraData);
    }


    // CONSTANTS

    string public constant name = "Smartz token";
    string public constant symbol = "SMTZ";
    uint8 public constant decimals = 18;

    uint256 public constant INITIAL_SUPPLY = 100*1000*1000 * (10 ** uint256(decimals));
}
