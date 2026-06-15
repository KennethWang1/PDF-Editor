import './css/Header.css';

function Header() {

  const username = "testing";
  //get username from backend later
  
  return (
        <header>
            <div onClick={() => {}} style={{cursor: 'pointer', height: "5v", flex: "flex-shrink"}} id = "user">
                <img src = "./sources/UserIcon.png" />
                <p>{username}</p>
            </div>
        </header>
  );
}

export default Header;
