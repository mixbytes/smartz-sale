pragma solidity 0.4.18;


/// @title Helper for unit-testing SmartzToken - DONT use in production!
contract TestKYCProvider {

    function setKYCPassed(address _address) public {
        m_KYC[_address] = true;
    }

    function isKYCPassed(address _address) public view returns (bool) {
        return m_KYC[_address];
    }

    mapping (address => bool) m_KYC;
}

