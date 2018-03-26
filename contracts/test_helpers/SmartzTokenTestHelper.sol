pragma solidity 0.4.18;

import '../SmartzToken.sol';


/// @title Helper for unit-testing SmartzToken - DONT use in production!
contract SmartzTokenTestHelper is SmartzToken {

    function SmartzTokenTestHelper(address[] _initialOwners, uint _signaturesRequired)
        public
        SmartzToken(_initialOwners, _signaturesRequired)
    {
    }

    function setTime(uint time) public {
        m_time = time;
    }

    function getTime() internal view returns (uint) {
        return m_time;
    }

    uint public m_time;
}
