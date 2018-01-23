pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/math/SafeMath.sol';

import 'mixbytes-solidity/contracts/ownership/multiowned.sol';
import 'mixbytes-solidity/contracts/token/MintableToken.sol';

import './IDetachable.sol';
import './IEmissionPartMinter.sol';
import './SmartzToken.sol';


/// @title Contract orchestrates minting of SMR tokens to various parties.
contract SmartzTokenLifecycleManager is multiowned, IDetachable, MintableToken, IEmissionPartMinter {
    using SafeMath for uint256;

    /**
     * @notice State machine of the contract.
     *
     * State transitions are straightforward: MINTING2PUBLIC_SALES -> MINTING2POOLS -> CIRCULATING_TOKEN.
     */
    enum State {
        // minting tokens during public sales
        MINTING2PUBLIC_SALES,
        // minting tokens to token pools
        MINTING2POOLS,
        // further minting is not possible
        CIRCULATING_TOKEN
    }


    event StateChanged(State _state);


    modifier requiresState(State _state) {
        require(m_state == _state);
        _;
    }

    modifier onlyBy(address _from) {
        require(msg.sender == _from);
        _;
    }


    // PUBLIC FUNCTIONS

    function SmartzTokenLifecycleManager(address[] _owners, uint _signaturesRequired, SmartzToken _SMR)
        public
        multiowned(_owners, _signaturesRequired)
    {
        m_SMR = _SMR;
    }


    /// @notice Mints tokens during public sales
    function mint(address _to, uint256 _amount)
        public
        requiresState(State.MINTING2PUBLIC_SALES)
        onlyBy(m_sale)
    {
        m_SMR.mint(_to, _amount);
    }

    /// @notice Mints tokens to predefined token pools after public sales
    function mintPartOfEmission(address to, uint part, uint partOfEmissionForPublicSales)
        public
        requiresState(State.MINTING2POOLS)
        onlyBy(m_pools)
    {
        uint poolTokens = m_publiclyDistributedTokens.mul(part).div(partOfEmissionForPublicSales);
        m_SMR.mint(to, poolTokens);
    }

    /// @notice Detach is executed by sale contract or token pools contract
    function detach()
        public
    {
        if (m_state == State.MINTING2PUBLIC_SALES) {
            require(msg.sender == m_sale);
            m_sale = address(0);
        }
        else if (m_state == State.MINTING2POOLS) {
            require(msg.sender == m_pools);
            m_pools = address(0);

            // final stage of the lifecycle: autonomous token circulation
            changeState(State.CIRCULATING_TOKEN);
            m_SMR.disableMinting();
            assert(m_SMR.startCirculation());
            m_SMR.detachControllerForever();
        }
        else {
            revert();
        }
    }


    // ADMINISTRATIVE FUNCTIONS

    /// @dev Sets the next sale contract
    function setSale(address sale)
        external
        requiresState(State.MINTING2PUBLIC_SALES)
        onlymanyowners(keccak256(msg.data))
    {
        m_sale = sale;
    }

    /// @dev Sets contract which is responsible for token pools accounting
    function setPools(address pools)
        external
        requiresState(State.MINTING2PUBLIC_SALES)
        onlymanyowners(keccak256(msg.data))
    {
        m_pools = pools;
    }

    /// @dev Signals that there will be no more public sales
    function setSalesFinished()
        external
        requiresState(State.MINTING2PUBLIC_SALES)
        onlymanyowners(keccak256(msg.data))
    {
        require(m_pools != address(0));
        changeState(State.MINTING2POOLS);
        m_publiclyDistributedTokens = m_SMR.totalSupply();
    }


    // INTERNAL

    /// @dev performs only allowed state transitions
    function changeState(State _newState)
        private
    {
        assert(m_state != _newState);

        if (State.MINTING2PUBLIC_SALES == m_state) {    assert(State.MINTING2POOLS == _newState); }
        else if (State.MINTING2POOLS == m_state) {      assert(State.CIRCULATING_TOKEN == _newState); }
        else assert(false);

        m_state = _newState;
        StateChanged(m_state);
    }


    // FIELDS

    /// @notice managed SMR token
    SmartzToken public m_SMR;

    /// @notice current sale contract which can mint tokens
    address public m_sale;

    /// @notice contract which is responsible for token pools accounting
    address public m_pools;

    /// @notice stage of the life cycle
    State public m_state = State.MINTING2PUBLIC_SALES;

    /// @notice amount of tokens sold during public sales
    uint public m_publiclyDistributedTokens;
}
