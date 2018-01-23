pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/ERC20.sol';
import 'zeppelin-solidity/contracts/token/BasicToken.sol';

import 'mixbytes-solidity/contracts/ownership/multiowned.sol';
import 'mixbytes-solidity/contracts/token/MintableToken.sol';

import './IDetachable.sol';
import './IEmissionPartMinter.sol';


/**
 * @title Contract tracks (in percents) token allocation to various pools and early investors.
 *
 * When all public sales are finished and absolute values of token emission
 * are known, this pool percent-tokens are used to mint SMR tokens in
 * appropriate amounts.
 *
 * See also SmartzTokenLifecycleManager.sol.
 */
contract SmartzTokenEmissionPools is BasicToken, ERC20, multiowned, MintableToken {


    // PUBLIC FUNCTIONS

    function SmartzTokenEmissionPools(address[] _owners, uint _signaturesRequired, address _SMRMinter)
        public
        multiowned(_owners, _signaturesRequired)
    {
        m_SMRMinter = _SMRMinter;
    }


    /// @notice mints specified percent of token emission to pool
    function mint(address _to, uint256 _amount)
        public
        onlymanyowners(keccak256(msg.data))
    {
        require(_amount > 0 && _amount <= nonDistributedParts());

        // record new holder to auxiliary structure
        if (0 == balances[_to])
            m_holders.push(_to);

        totalSupply = totalSupply.add(_amount);
        balances[_to] = balances[_to].add(_amount);

        Transfer(address(0), _to, _amount);
        Mint(_to, _amount);

        assert(totalSupply <= maxSupply);
    }

    /// @notice get appropriate amount of SMR for msg.sender account
    function claimSMR()
        external
    {
        require(isDistributed());

        claimSMRFor(msg.sender);
    }

    /// @notice iteratively distributes SMR according to SMRE possession to all SMRE holders and pools
    function claimSMRforAll(uint invocationsLimit)
        external
    {
        require(isDistributed());
        require(unclaimedPoolsPresent());

        uint startingGas = msg.gas;
        uint invocations = 0;
        while (unclaimedPoolsPresent() && ++invocations <= invocationsLimit) {
            claimSMRFor(m_holders[m_unclaimedHolderIdx++]);

            uint avgGasPerInvocation = startingGas.sub(msg.gas).div(invocations);
            if (avgGasPerInvocation.add(70000) > msg.gas)
                break;  // enough invocations for this call
        }

        if (! unclaimedPoolsPresent())
            // all tokens claimed - detaching
            IDetachable(m_SMRMinter).detach();
    }


    // VIEWS

    /// @dev amount of non-distributed SMRE
    function nonDistributedParts() public view returns (uint) {
        return maxSupply.sub(totalSupply);
    }

    /// @dev checks if all SMRE were distributed
    function isDistributed() public view returns (bool) {
        return 0 == nonDistributedParts();
    }

    /// @dev are there parties which still have't received their SMR?
    function unclaimedPoolsPresent() public view returns (bool) {
        return m_unclaimedHolderIdx < m_holders.length;
    }


    /*
     * PUBLIC FUNCTIONS: ERC20
     *
     * SMRE tokens are not transferable. ERC20 here is for convenience - to see balance in a wallet.
     */

    function transfer(address /* to */, uint256 /* value */) public returns (bool) {
        revert();
    }

    function allowance(address /* owner */, address /* spender */) public view returns (uint256) {
        revert();
    }
    function transferFrom(address /* from */, address /* to */, uint256 /* value */) public returns (bool) {
        revert();
    }

    function approve(address /* spender */, uint256 /* value */) public returns (bool) {
        revert();
    }


    // INTERNAL

    /// @dev mint SMR tokens for SMRE holder
    function claimSMRFor(address _for)
        private
    {
        require(0 != balances[_for]);
        if (m_tokensClaimed[_for])
            return;

        m_tokensClaimed[_for] = true;

        uint part = balances[_for];
        uint partOfEmissionForPublicSales = uint(percentOfPublicSales) * (uint(10) ** uint(decimals));

        // If it's too early (not an appropriate SMR lifecycle stage, see SmartzTokenLifecycleManager),
        // m_SMRMinter will revert() and all changes to the state of this contract will be rolled back.
        IEmissionPartMinter(m_SMRMinter).mintPartOfEmission(_for, part, partOfEmissionForPublicSales);
    }


    // FIELDS

    /// @dev IDetachable IEmissionPartMinter
    address public m_SMRMinter;

    /// @dev list of all SMRE holders
    address[] public m_holders;

    /// @dev index in m_holders which is scheduled next for SMRE->SMR conversion
    uint public m_unclaimedHolderIdx;

    /// @dev keeps track of pool which claimed their SMR
    /// As they could do it manually, out-of-order, m_unclaimedHolderIdx is not enough.
    mapping(address => bool) public m_tokensClaimed;


    // CONSTANTS

    string public constant name = "Part of Smartz token emission";
    string public constant symbol = "SMRE";
    uint8 public constant decimals = 2;

    /// @notice percent (without any fractional parts) of SMR tokens distributed to the public
    /// (so this contract manages remaining 100 - percentOfPublicSales).
    uint public constant percentOfPublicSales = 50;

    // @notice maximum amount of SMRE to be allocated, in smallest units (1/100 of percent)
    uint public constant maxSupply = (uint(100) - percentOfPublicSales) * (uint(10) ** uint(decimals));
}
