pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/StandardToken.sol';

import 'mixbytes-solidity/contracts/security/ArgumentsChecker.sol';
import 'mixbytes-solidity/contracts/ownership/multiowned.sol';


/// @title Interface responsible for reporting KYC status of an address.
interface IKYCProvider {
    function isKYCPassed(address _address) public view returns (bool);
}


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


contract SmartzToken is ArgumentsChecker, multiowned, StandardToken {

    /// @title Unit of frozen tokens - tokens which can't be spent until certain conditions is met.
    struct FrozenCell {
        /// @notice amount of frozen tokens
        uint amount;

        /// @notice until this unix time the cell is considered frozen
        uint128 thawTS;

        /// @notice is KYC required for a token holder to spend this cell?
        uint128 isKYCRequired;
    }


    event Burn(address indexed from, uint256 amount);


    // MODIFIERS

    modifier onlySale(address account) {
        require(isSale(account));
        _;
    }

    modifier validUnixTS(uint ts) {
        require(ts >= 1522046326 && ts <= 1800000000);
        _;
    }

    modifier checkTransferInvariant(address from, address to) {
        uint initial = balanceOf(from).add(balanceOf(to));
        _;
        assert(balanceOf(from).add(balanceOf(to)) == initial);
    }


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

    /// @notice version of balanceOf which includes all frozen tokens
    function balanceOf(address _owner) public view returns (uint256) {
        uint256 balance = balances[_owner];

        for (uint cellIndex = 0; cellIndex < frozenBalances[_owner].length; ++cellIndex) {
            balance = balance.add(frozenBalances[_owner][cellIndex].amount);
        }

        return balance;
    }

    /// @notice version of balanceOf which includes only currently spendable tokens
    function availableBalanceOf(address _owner) public view returns (uint256) {
        uint256 balance = balances[_owner];

        for (uint cellIndex = 0; cellIndex < frozenBalances[_owner].length; ++cellIndex) {
            if (isSpendableFrozenCell(_owner, cellIndex))
                balance = balance.add(frozenBalances[_owner][cellIndex].amount);
        }

        return balance;
    }

    /**
     * Function to burn msg.sender's tokens.
     *
     * @param _amount The amount of tokens to burn
     *
     * @return A boolean that indicates if the operation was successful.
     */
    function burn(uint256 _amount)
        public
        payloadSizeIs(1 * 32)
        returns (bool)
    {
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

    /// @notice Sets current KYC provider of the token
    function setKYCProvider(address KYCProvider)
        external
        validAddress(KYCProvider)
        onlymanyowners(keccak256(msg.data))
    {
        m_KYCProvider = IKYCProvider(KYCProvider);
    }

    /// @notice Sets sale status of an accounts
    function setSale(address account, bool isSale)
        external
        validAddress(account)
        onlymanyowners(keccak256(msg.data))
    {
        m_sales[account] = isSale;
    }


    /// @notice Transfers tokens to a recipient and freezes it
    function frozenTransfer(address _to, uint256 _value, uint thawTS, bool isKYCRequired)
        external
        validAddress(_to)
        validUnixTS(thawTS)
        payloadSizeIs(4 * 32)
        onlySale(msg.sender)
        //checkTransferInvariant(msg.sender, _to) too many local variables - compiler fails
        returns (bool)
    {
        require(_value <= balances[msg.sender]);

        uint128 thawTSEncoded = uint128(thawTS);
        uint128 isKYCRequiredEncoded = isKYCRequired ? uint128(1) : uint128(0);

        uint cellIndex = findFrozenCell(_to, thawTSEncoded, isKYCRequiredEncoded);
        FrozenCell storage targetCell = frozenBalances[_to][cellIndex];

        // In case cell is not found - creating new.
        if (cellIndex == frozenBalances[_to].length) {
            frozenBalances[_to].length++;
            assert(0 == targetCell.amount);

            targetCell.thawTS = thawTSEncoded;
            targetCell.isKYCRequired = isKYCRequiredEncoded;
        }

        assert(targetCell.thawTS == thawTSEncoded && targetCell.isKYCRequired == isKYCRequiredEncoded);

        // performing transfer
        balances[msg.sender] = balances[msg.sender].sub(_value);
        targetCell.amount = targetCell.amount.add(_value);
        Transfer(msg.sender, _to, _value);

        return true;
    }


    // INTERNAL FUNCTIONS

    function isSale(address account) private view returns (bool) {
        return m_sales[account];
    }

    /**
     * @dev Tries to find existent FrozenCell that matches (thawTS, isKYCRequired).
     *
     * @return index in frozenBalances[_owner] which equals to frozenBalances[_owner].length in case cell is not found
     *
     * Because frozen* functions are only for token sales and token sale number is limited, expecting cellIndex
     * to be ~ 1-5 and the following loop to be O(1).
     */
    function findFrozenCell(address owner, uint128 thawTSEncoded, uint128 isKYCRequiredEncoded)
        private
        view
        returns (uint cellIndex)
    {
        for (cellIndex = 0; cellIndex < frozenBalances[owner].length; ++cellIndex) {
            FrozenCell storage checkedCell = frozenBalances[owner][cellIndex];
            if (checkedCell.thawTS == thawTSEncoded && checkedCell.isKYCRequired == isKYCRequiredEncoded)
                break;
        }

        assert(cellIndex <= frozenBalances[owner].length);
    }

    function isSpendableFrozenCell(address owner, uint cellIndex)
        private
        view
        returns (bool)
    {
        FrozenCell storage cell = frozenBalances[owner][cellIndex];
        if (uint(cell.thawTS) > getTime())
            return false;

        if (cell.isKYCRequired != uint128(0) && !m_KYCProvider.isKYCPassed(owner))
            return false;

        return true;
    }

    /// @dev to be overridden in tests
    function getTime() internal view returns (uint) {
        return now;
    }


    // FIELDS

    /// @notice current KYC provider of the token
    IKYCProvider public m_KYCProvider;

    /// @notice set of sale accounts which can freeze tokens
    mapping (address => bool) public m_sales;

    /// @notice frozen tokens
    mapping (address => FrozenCell[]) public frozenBalances;


    // CONSTANTS

    string public constant name = "Smartz token";
    string public constant symbol = "SMR";
    uint8 public constant decimals = 18;

    uint public constant MAX_SUPPLY = uint(150) * uint(1000000) * uint(10) ** uint(decimals);
}
