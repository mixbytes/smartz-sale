pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/StandardToken.sol';


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


    // CONSTANTS

    string public constant name = "Smartz token";
    string public constant symbol = "SMTZ";
    uint8 public constant decimals = 18;

    uint256 public constant INITIAL_SUPPLY = 100*1000*1000 * (10 ** uint256(decimals));
}
